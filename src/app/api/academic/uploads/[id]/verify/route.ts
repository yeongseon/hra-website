/** 요청에는 식별자만 받고, 실제 파일은 서버가 저장소에서 스트림 검증한다. */
import { verifyAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { assertUploadOrigin, readUploadJson, uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
import { z } from "zod/v4";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
export const runtime="nodejs";
export const maxDuration=120;
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    assertUploadOrigin(request);const input=z.object({assignmentId:z.uuid()}).strict().safeParse(await readUploadJson(request));
    if(!input.success)throw new AcademicUploadError("NOT_FOUND");
    await verifyAssignmentUploadIntent({...input.data,uploadIntentId:(await params).id});
    return Response.json({state:"VERIFIED"},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return uploadErrorResponse(error);}
}
