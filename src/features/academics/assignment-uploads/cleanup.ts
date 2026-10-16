/** 토큰 만료와 유예가 끝난 미참조 객체만 정리한다. 기본 비활성·기본 dry-run이다. */
import "server-only";
import { BlobNotFoundError, del, head } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { z } from "zod/v4";
import { academicSubmissionStore, matchesAcademicBlob } from "./store";
import { academicUploadPath, AcademicUploadError } from "./contract";
import { withUploadDatabaseErrors } from "./repository";
export async function cleanupAcademicUploads(options:{dryRun?:boolean;limit?:number}={}) {
  const dryRun=options.dryRun!==false || process.env.ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED!=="true";
  if(process.env.ACADEMIC_UPLOAD_CLEANUP_ENABLED!=="true")return {enabled:false,dryRun:true,candidates:0,deleted:0,failed:0};
  const limit=z.number().int().min(1).max(100).parse(options.limit??25);const store=academicSubmissionStore();
  return withUploadDatabaseErrors(async()=>{
    // 삭제 완료 원장도 다시 조회하여 만료 직전에 시작해 뒤늦게 완료된 PUT을 찾는다.
    const result=await db.execute(sql`SELECT i.id,i.storage_key FROM assignment_upload_intents i JOIN academic_upload_authorizations a ON a.intent_id=i.id
      WHERE i.state<>'CONSUMED' AND i.expires_at+interval '5 minutes'<=clock_timestamp()
        AND NOT EXISTS(SELECT 1 FROM assignment_submissions s WHERE s.upload_intent_id=i.id)
        AND NOT EXISTS(SELECT 1 FROM assignment_submission_files f WHERE f.storage_key=i.storage_key)
      ORDER BY coalesce(a.deleted_at,'epoch'::timestamptz),i.expires_at LIMIT ${limit}`);
    let deleted=0;let failed=0;
    for(const raw of result.rows){
      const row=z.object({id:z.uuid(),storage_key:z.string()}).parse(raw);
      if(row.storage_key!==academicUploadPath(row.id)){failed++;continue;}
      if(dryRun)continue;
      const claimed=await db.execute(sql`SELECT claim_academic_upload_cleanup(${row.id}::uuid) AS claimed`);
      if(claimed.rows[0]?.claimed!==true)continue;
      try{
        const metadata=await head(row.storage_key,{token:store.token,abortSignal:AbortSignal.timeout(10_000)});
        if(metadata.pathname!==row.storage_key || !matchesAcademicBlob(metadata.url,row.storage_key))throw new AcademicUploadError("CONFLICT");
        await del(row.storage_key,{token:store.token,ifMatch:metadata.etag,abortSignal:AbortSignal.timeout(10_000)});deleted++;
        await db.execute(sql`UPDATE academic_upload_authorizations SET deleted_at=clock_timestamp() WHERE intent_id=${row.id}::uuid`);
      }catch(error){
        if(error instanceof BlobNotFoundError)await db.execute(sql`UPDATE academic_upload_authorizations SET deleted_at=clock_timestamp() WHERE intent_id=${row.id}::uuid`);
        else failed++;
      }
    }
    return {enabled:true,dryRun,candidates:result.rows.length,deleted,failed};
  });
}
