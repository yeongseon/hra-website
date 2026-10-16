/** 요청에는 식별자만 받고, 실제 파일은 서버가 저장소에서 스트림 검증한다. */
import { verifyAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { assertUploadOrigin, readUploadJson, uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
import { z } from "zod/v4";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
import { createAcademicObservation } from "@/lib/academic-observability";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  const observation=createAcademicObservation("UPLOAD_VERIFY","UPLOAD_INTENT");
  try{
    assertUploadOrigin(request);const input=z.object({assignmentId:z.uuid()}).strict().safeParse(await readUploadJson(request));
    if(!input.success)throw new AcademicUploadError("NOT_FOUND");
    await verifyAssignmentUploadIntent({...input.data,uploadIntentId:(await params).id},observation);
    return Response.json({state:"VERIFIED",referenceId:observation.correlationId},{headers:{"Cache-Control":"no-store","X-Request-Id":observation.correlationId}});
  }catch(error){return uploadErrorResponse(error,observation);}
}
