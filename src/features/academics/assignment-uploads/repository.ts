/** DB 함수 어댑터. 공개 오류에는 SQL·경로·계정·파일명 원문을 포함하지 않는다. */
import "server-only";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { AcademicUploadError, type AcademicUploadErrorCode } from "./contract";

export const uploadRecordSchema=z.object({
  intent_id:z.uuid(),target_id:z.uuid(),user_id:z.uuid(),original_name:z.string(),expected_size:z.number().int(),
  storage_key:z.string(),expires_at:z.coerce.date(),state:z.enum(["INTENDED","VERIFIED","CONSUMED","EXPIRED"]),
  verified_etag:z.string().nullable(),
});
export type UploadRecord=z.infer<typeof uploadRecordSchema>;
const machineErrors=new Map<string,AcademicUploadErrorCode>([["upload_not_found","NOT_FOUND"],["upload_expired","EXPIRED"],["upload_conflict","CONFLICT"],["upload_invalid_file","INVALID_FILE"]]);
export async function withUploadDatabaseErrors<T>(operation:()=>Promise<T>):Promise<T> {
  try {return await operation();} catch(error) {
    if(error instanceof AcademicUploadError) throw error;
    const seen=new Set<object>();let current:unknown=error;
    while(typeof current==="object" && current!==null && !seen.has(current)) {
      seen.add(current);
      if("code" in current && current.code==="P0001" && "message" in current && typeof current.message==="string") {
        const code=machineErrors.get(current.message);if(code) throw new AcademicUploadError(code);
      }
      current="cause" in current ? current.cause : undefined;
    }
    throw new AcademicUploadError("UNAVAILABLE");
  }
}
/** 고유 의도 수가 아닌 발급 요청만 별도 계산하며, 토큰·검증의 기존 외부 작업 합계 상한은 유지합니다. */
export async function reserveAssignmentUploadAttempt(userId:string,targetId:string,phase:"intent"|"external"):Promise<void> {
  await withUploadDatabaseErrors(async()=>{
    const hash=(scope:string,value:string)=>createHash("sha256").update(scope).update("\0").update(value).digest("hex");
    // 기존 외부 scope는 그대로 두어 배포 전 예약도 만료될 때까지 보수적으로 적용합니다.
    const scopes=phase==="intent"?["academic-upload-intent-user","academic-upload-intent-target"]:["academic-upload-user","academic-upload-target"];
    const result=await db.execute(sql`SELECT allowed, retry_after_sec FROM reserve_rate_limit(
      ARRAY[${scopes[0]},${scopes[1]}]::text[],
      ARRAY[${hash("user",userId)},${hash("target",targetId)}]::text[],ARRAY[6,4]::integer[],ARRAY[60,60]::integer[])`);
    // 잘못된 결과나 DB 장애는 검증·토큰 발급으로 이어지지 않게 차단합니다.
    const row=z.object({allowed:z.boolean(),retry_after_sec:z.number().int().min(0).max(60)}).parse(result.rows[0]);
    if(!row.allowed) throw new AcademicUploadError("RATE_LIMITED",row.retry_after_sec);
  });
}
export async function issueUploadRecord(input:{requestId:string;targetId:string;userId:string;originalName:string;sizeBytes:number}):Promise<string> {
  return withUploadDatabaseErrors(async()=>{
    const result=await db.execute(sql`SELECT issue_academic_assignment_upload(${input.requestId}::uuid,${input.targetId}::uuid,${input.userId}::uuid,${input.originalName}::text,${input.sizeBytes}::integer) AS id`);
    return z.uuid().parse(result.rows[0]?.id);
  });
}
export async function authorizeUploadRecord(intentId:string,userId:string):Promise<UploadRecord> {
  return withUploadDatabaseErrors(async()=>{
    const result=await db.execute(sql`SELECT to_jsonb(a)||jsonb_build_object('storage_key',i.storage_key,'expires_at',i.expires_at,'state',i.state) AS upload
      FROM authorize_academic_assignment_upload(${intentId}::uuid,${userId}::uuid) a JOIN assignment_upload_intents i ON i.id=a.intent_id`);
    return uploadRecordSchema.parse(result.rows[0]?.upload);
  });
}
export async function persistUploadVerification(id:string,userId:string,checksum:string,etag:string):Promise<void> {
  await withUploadDatabaseErrors(async()=>{await db.execute(sql`SELECT verify_authorized_academic_upload(${id}::uuid,${userId}::uuid,${checksum}::text,${etag}::text)`);});
}
export async function retireUploadRecord(id:string,userId:string,targetId:string):Promise<void> {
  await withUploadDatabaseErrors(async()=>{await db.execute(sql`SELECT cancel_academic_assignment_upload(${id}::uuid,${userId}::uuid,${targetId}::uuid)`);});
}
// callback은 서명 검증을 거친 내부 호출만 사용하며 임의 URL 대신 원장의 정확한 경로를 선택한다.
export async function getUploadReceiptRecord(id:string):Promise<{storageKey:string}|null> {
  return withUploadDatabaseErrors(async()=>{
    const result=await db.execute(sql`SELECT i.storage_key FROM assignment_upload_intents i JOIN academic_upload_authorizations a ON a.intent_id=i.id WHERE i.id=${id}::uuid`);
    return typeof result.rows[0]?.storage_key==="string" ? {storageKey:result.rows[0].storage_key} : null;
  });
}
export async function recordUploadReceipt(id:string):Promise<void> {
  await withUploadDatabaseErrors(async()=>{await db.execute(sql`UPDATE academic_upload_authorizations SET received_at=coalesce(received_at,clock_timestamp()) WHERE intent_id=${id}::uuid`);});
}
