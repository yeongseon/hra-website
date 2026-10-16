/** 학생 세션·현재 대상·발급 원장·실제 비공개 객체를 재검증한다. 파일 검증은 최종 제출이 아니다. */
import "server-only";
import { createHash } from "node:crypto";
import { get, head } from "@vercel/blob";
import { requireAssignmentTarget } from "@/lib/academic-permissions";
import { AcademicUploadError, academicUploadPath, assignmentUploadInput, assignmentUploadSelection, assertAcademicUploadsEnabled, MAX_ASSIGNMENT_UPLOAD_BYTES } from "./contract";
import { academicSubmissionStore, matchesAcademicBlob } from "./store";
import { authorizeUploadRecord, issueUploadRecord, persistUploadVerification, reserveAssignmentUploadAttempt, retireUploadRecord } from "./repository";

// DB에서도 다시 검사한다. 이 검사는 불필요한 스토리지 요청을 먼저 차단한다.
function assertOpen(target:{status:string;dueAt:Date}) {if(target.status!=="PUBLISHED" || target.dueAt.getTime()<=Date.now()) throw new AcademicUploadError("EXPIRED");}
export async function createAssignmentUploadIntent(input:unknown) {
  assertAcademicUploadsEnabled();
  const parsed=assignmentUploadInput.safeParse(input);if(!parsed.success) throw new AcademicUploadError("INVALID_FILE");
  const target=await requireAssignmentTarget({assignmentId:parsed.data.assignmentId});assertOpen(target);
  academicSubmissionStore();
  await reserveAssignmentUploadAttempt(target.userId,target.targetId);
  const id=await issueUploadRecord({...parsed.data,targetId:target.targetId,userId:target.userId});
  const record=await authorizeUploadRecord(id,target.userId);
  return {uploadIntentId:id,pathname:academicUploadPath(id),expiresAt:record.expires_at.toISOString()};
}
export async function authorizeAssignmentUploadToken(input:unknown,pathname:string,multipart:boolean) {
  assertAcademicUploadsEnabled();
  const parsed=assignmentUploadSelection.safeParse(input);if(!parsed.success) throw new AcademicUploadError("NOT_FOUND");
  const target=await requireAssignmentTarget({assignmentId:parsed.data.assignmentId});assertOpen(target);
  const record=await authorizeUploadRecord(parsed.data.uploadIntentId,target.userId);
  if(record.target_id!==target.targetId || record.state!=="INTENDED" || multipart || record.storage_key!==academicUploadPath(record.intent_id) || pathname!==record.storage_key) throw new AcademicUploadError("CONFLICT");
  await reserveAssignmentUploadAttempt(target.userId,target.targetId);
  return {allowedContentTypes:["application/pdf"],maximumSizeInBytes:record.expected_size,
    validUntil:record.expires_at.getTime(),addRandomSuffix:false,allowOverwrite:false,
    tokenPayload:JSON.stringify({uploadIntentId:record.intent_id})};
}

/** #152가 호출하는 합의된 인터페이스. 세션 주체나 저장 키를 입력으로 받지 않는다. */
export async function verifyAssignmentUploadIntent(input:{assignmentId:string;uploadIntentId:string}):Promise<void> {
  assertAcademicUploadsEnabled();
  const parsed=assignmentUploadSelection.safeParse(input);if(!parsed.success) throw new AcademicUploadError("NOT_FOUND");
  const target=await requireAssignmentTarget({assignmentId:parsed.data.assignmentId});assertOpen(target);
  const record=await authorizeUploadRecord(parsed.data.uploadIntentId,target.userId);
  if(record.target_id!==target.targetId || record.storage_key!==academicUploadPath(record.intent_id)) throw new AcademicUploadError("NOT_FOUND");
  await reserveAssignmentUploadAttempt(target.userId,target.targetId);
  const store=academicSubmissionStore();
  try {
    const metadata=await head(record.storage_key,{token:store.token,abortSignal:AbortSignal.timeout(15_000)});
    if(!matchesAcademicBlob(metadata.url,record.storage_key) || metadata.pathname!==record.storage_key || metadata.contentType!=="application/pdf" || metadata.size!==record.expected_size || metadata.size<1 || metadata.size>MAX_ASSIGNMENT_UPLOAD_BYTES) throw new AcademicUploadError("INVALID_FILE");
    const result=await get(record.storage_key,{access:"private",token:store.token,useCache:false,abortSignal:AbortSignal.timeout(60_000)});
    if(!result || result.statusCode!==200) throw new AcademicUploadError("NOT_READY");
    if(result.blob.pathname!==record.storage_key || !matchesAcademicBlob(result.blob.url,record.storage_key) || result.blob.etag!==metadata.etag || result.blob.size!==metadata.size || result.blob.contentType!=="application/pdf") {await result.stream.cancel();throw new AcademicUploadError("INVALID_FILE");}
    const reader=result.stream.getReader();const hash=createHash("sha256");const prefix=new Uint8Array(5);let length=0;
    try {
      for(;;) {
        const chunk=await reader.read();if(chunk.done) break;
        const start=length;length+=chunk.value.byteLength;
        if(length>MAX_ASSIGNMENT_UPLOAD_BYTES || length>record.expected_size) throw new AcademicUploadError("INVALID_FILE");
        if(start<5) prefix.set(chunk.value.subarray(0,Math.min(5-start,chunk.value.length)),start);
        hash.update(chunk.value);
      }
    } finally {await reader.cancel();}
    if(length!==record.expected_size || ![0x25,0x50,0x44,0x46,0x2d].every((byte,index)=>prefix[index]===byte)) throw new AcademicUploadError("INVALID_FILE");
    // 원본을 읽는 동안 권한·기한이 바뀌었어도 DB의 현재 값으로 거부한다.
    await persistUploadVerification(record.intent_id,target.userId,hash.digest("hex"),metadata.etag);
  } catch(error) {
    if(error instanceof AcademicUploadError) throw error;
    throw new AcademicUploadError("UNAVAILABLE");
  }
}
export async function cancelAssignmentUploadIntent(input:unknown):Promise<void> {
  assertAcademicUploadsEnabled();const parsed=assignmentUploadSelection.safeParse(input);if(!parsed.success) throw new AcademicUploadError("NOT_FOUND");
  const target=await requireAssignmentTarget({assignmentId:parsed.data.assignmentId});
  // 취소는 만료 후 복구에도 필요하다. 공개/마감 검사를 재사용하지 않고 DB가 현재 소유권과 기대 대상을 함께 잠근다.
  await retireUploadRecord(parsed.data.uploadIntentId,target.userId,target.targetId);
}
