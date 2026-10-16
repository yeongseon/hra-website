/** 브라우저는 작은 승인 요청과 비공개 직접 전송만 수행한다. 최종 제출은 #152가 담당한다. */
import { upload } from "@vercel/blob/client";
import { z } from "zod/v4";
import { assignmentUploadInput } from "./contract";
export async function uploadAssignmentFile(input:{assignmentId:string;file:File;requestId?:string;abortSignal?:AbortSignal;onProgress?:(percentage:number)=>void;onIntent?:(id:string)=>void}):Promise<{uploadIntentId:string}> {
  const parsed=assignmentUploadInput.safeParse({assignmentId:input.assignmentId,requestId:input.requestId??crypto.randomUUID(),originalName:input.file.name,sizeBytes:input.file.size,mimeType:input.file.type});
  if(!parsed.success)throw new Error("비어 있지 않은 PDF 파일 한 개를 50MiB 이하로 선택해 주세요.");
  const response=await fetch("/api/academic/uploads/intents",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed.data),signal:input.abortSignal});
  if(!response.ok)throw new Error("업로드를 승인받지 못했습니다. 과제 상태를 확인해 주세요.");
  const issued=z.object({uploadIntentId:z.uuid(),pathname:z.string(),expiresAt:z.string()}).parse(await response.json());
  // PUT 응답이 유실되어도 UI가 같은 의도와 제출 키로 복구할 수 있게 먼저 알린다.
  input.onIntent?.(issued.uploadIntentId);
  await upload(issued.pathname,input.file,{access:"private",handleUploadUrl:"/api/academic/uploads",contentType:"application/pdf",multipart:false,
    abortSignal:input.abortSignal,onUploadProgress:progress=>input.onProgress?.(progress.percentage),clientPayload:JSON.stringify({assignmentId:input.assignmentId,uploadIntentId:issued.uploadIntentId})});
  // SDK의 URL은 최종 제출 입력으로 반환하지 않는다. 검증과 최종화는 식별자로 서버에 요청한다.
  return {uploadIntentId:issued.uploadIntentId};
}
