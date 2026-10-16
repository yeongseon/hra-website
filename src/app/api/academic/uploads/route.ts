/** SDK의 비공개 직접 업로드 토큰과 서명된 완료 영수증만 처리한다. */
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod/v4";
import { authorizeAssignmentUploadToken } from "@/features/academics/assignment-uploads/server";
import { AcademicUploadError, academicUploadPath, assertAcademicUploadsEnabled } from "@/features/academics/assignment-uploads/contract";
import { academicSubmissionStore, matchesAcademicBlob } from "@/features/academics/assignment-uploads/store";
import { getUploadReceiptRecord, recordUploadReceipt } from "@/features/academics/assignment-uploads/repository";
import { assertUploadOrigin, readUploadJson, uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
import { reserveUploadAttempt } from "@/lib/rate-limit";
import { extractClientIp } from "@/lib/rate-limit-core";
import { createAcademicObservation } from "@/lib/academic-observability";
export const runtime="nodejs";
// 원본 JSON의 추가 속성을 보존해 SDK가 서명 검증에 같은 본문을 사용하게 한다.
const bodySchema=z.discriminatedUnion("type",[
  z.object({type:z.literal("blob.generate-client-token"),payload:z.object({pathname:z.string(),multipart:z.boolean(),clientPayload:z.string().nullable()}).passthrough()}).passthrough(),
  z.object({type:z.literal("blob.upload-completed"),payload:z.object({blob:z.object({url:z.string(),pathname:z.string(),downloadUrl:z.string(),contentType:z.string(),contentDisposition:z.string(),etag:z.string()}).passthrough(),tokenPayload:z.string().nullable().optional()}).passthrough()}).passthrough(),
]);
// Zod가 반환한 새 객체는 키 순서를 바꿀 수 있으므로 검증 뒤에도 원본 JSON을 SDK에 전달한다.
function isUploadBody(value:unknown):value is HandleUploadBody {return bodySchema.safeParse(value).success;}
export async function POST(request:Request){
  let observation=createAcademicObservation("UPLOAD_TOKEN","UPLOAD_INTENT");
  try{
    assertAcademicUploadsEnabled();
    const body=await readUploadJson(request);if(!isUploadBody(body))throw new AcademicUploadError("INVALID_FILE");
    if(body.type==="blob.upload-completed")observation=createAcademicObservation("UPLOAD_RECEIPT","UPLOAD_INTENT");
    const result=await handleUpload({body,request,token:academicSubmissionStore().token,
      onBeforeGenerateToken:async(pathname,payload,multipart)=>{
        assertUploadOrigin(request);
        let input:unknown;try{input=JSON.parse(payload??"");}catch{throw new AcademicUploadError("INVALID_FILE");}
        const authorization=await authorizeAssignmentUploadToken(input,pathname,multipart,observation);
        const reservation=await reserveUploadAttempt(extractClientIp(request.headers));
        if(reservation.blocked)throw new AcademicUploadError("RATE_LIMITED");
        return authorization;
      },
      onUploadCompleted:async({blob,tokenPayload})=>{
        // SDK 서명 검증 뒤 실행한다. 사용자 세션 없이도 기존 원장 수신만 멱등 기록하며 VERIFIED로 만들지 않는다.
        let payload:unknown;try{payload=JSON.parse(tokenPayload??"");}catch{throw new AcademicUploadError("NOT_FOUND");}
        const selected=z.object({uploadIntentId:z.uuid()}).strict().safeParse(payload);if(!selected.success)throw new AcademicUploadError("NOT_FOUND");
        // SDK가 검증한 공급자 서명은 사용자 로그인 증명이 아니므로 actor는 null로 유지합니다.
        observation.identify({resourceId:selected.data.uploadIntentId});
        observation.emit("AUTHORIZED");
        const receipt=await getUploadReceiptRecord(selected.data.uploadIntentId);
        if(!receipt || receipt.storageKey!==academicUploadPath(selected.data.uploadIntentId) || blob.pathname!==receipt.storageKey || !matchesAcademicBlob(blob.url,receipt.storageKey))throw new AcademicUploadError("NOT_FOUND");
        await recordUploadReceipt(selected.data.uploadIntentId);
      },
    });
    observation.emit("COMPLETED");
    return Response.json(result,{headers:{"Cache-Control":"no-store","X-Request-Id":observation.correlationId}});
  }catch(error){return uploadErrorResponse(error,observation);}
}
