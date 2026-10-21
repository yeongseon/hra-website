/** 브라우저는 작은 승인 요청과 비공개 직접 전송만 수행한다. 최종 제출은 #152가 담당한다. */
import { put } from "@vercel/blob/client";
import { z } from "zod/v4";
import { AcademicUploadError, assignmentUploadInput } from "./contract";
import { readAcademicRequestReference } from "@/lib/academic-request-reference";
export async function uploadAssignmentFile(input:{assignmentId:string;file:File;requestId?:string;abortSignal?:AbortSignal;onProgress?:(percentage:number)=>void;onIntent?:(id:string)=>void;onRequestReference?:(id:string)=>void}):Promise<{uploadIntentId:string}> {
  const parsed=assignmentUploadInput.safeParse({assignmentId:input.assignmentId,requestId:input.requestId??crypto.randomUUID(),originalName:input.file.name,sizeBytes:input.file.size,mimeType:input.file.type});
  if(!parsed.success)throw new Error("비어 있지 않은 PDF 파일 한 개를 50MiB 이하로 선택해 주세요.");
  const response=await fetch("/api/academic/uploads/intents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data),signal:input.abortSignal});
  const issued=z.object({uploadIntentId:z.uuid(),pathname:z.string(),expiresAt:z.string()}).parse(await readUploadResponse(response,input.onRequestReference));
  // PUT 응답이 유실되어도 UI가 같은 의도와 제출 키로 복구할 수 있게 먼저 알립니다.
  input.onIntent?.(issued.uploadIntentId);
  // SDK upload()는 토큰 API의 429 본문을 버립니다. 같은 공개 토큰 교환을 직접 요청하고
  // SDK의 공개 put()으로 이어 대기 시간·서버 참조를 보존하며 토큰은 메모리에만 둡니다.
  const tokenResponse=await fetch("/api/academic/uploads",{method:"POST",headers:{"Content-Type":"application/json"},signal:input.abortSignal,
    body:JSON.stringify({type:"blob.generate-client-token",payload:{pathname:issued.pathname,multipart:false,
      clientPayload:JSON.stringify({assignmentId:input.assignmentId,uploadIntentId:issued.uploadIntentId})}})});
  const {clientToken}=z.object({clientToken:z.string().startsWith("vercel_blob_client_")}).parse(await readUploadResponse(tokenResponse,input.onRequestReference));
  await put(issued.pathname,input.file,{access:"private",token:clientToken,contentType:"application/pdf",multipart:false,
    abortSignal:input.abortSignal,onUploadProgress:progress=>input.onProgress?.(progress.percentage)});
  // SDK의 URL은 최종 제출 입력으로 반환하지 않는다. 검증과 최종화는 식별자로 서버에 요청한다.
  return {uploadIntentId:issued.uploadIntentId};
}

/** 서버의 원본 메시지는 버리고 고정 오류와 검증된 대기 시간·요청 참조만 사용합니다. */
async function readUploadResponse(response:Response,onRequestReference?: (id:string)=>void):Promise<unknown> {
  const body:unknown=await response.json().catch(()=>null);
  if(response.ok)return body;
  const failure=z.object({referenceId:z.unknown().optional(),code:z.unknown().optional(),retryAfterSeconds:z.unknown().optional()}).safeParse(body);
  if(failure.success){
    const reference=readAcademicRequestReference(failure.data.referenceId);
    if(reference)onRequestReference?.(reference);
    if(response.status===429 && failure.data.code==="RATE_LIMITED"){
      const wait=z.number().int().min(1).max(60).safeParse(failure.data.retryAfterSeconds);
      throw new AcademicUploadError("RATE_LIMITED",wait.success?wait.data:60);
    }
  }
  throw new Error("업로드를 승인받지 못했습니다. 과제 상태를 확인해 주세요.");
}
