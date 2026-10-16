/** 취소는 발급 원장만 종료한다. 유효한 토큰이 남은 객체를 즉시 삭제하지 않는다. */
import { cancelAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { assertUploadOrigin, readUploadJson, uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
import { z } from "zod/v4";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
export const runtime="nodejs";
export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){
  try{
    assertUploadOrigin(request);const input=z.object({assignmentId:z.uuid()}).strict().safeParse(await readUploadJson(request));
    if(!input.success)throw new AcademicUploadError("NOT_FOUND");
    await cancelAssignmentUploadIntent({...input.data,uploadIntentId:(await params).id});
    return Response.json({state:"CANCELLED"},{headers:{"Cache-Control":"no-store"}});
  }catch(error){return uploadErrorResponse(error);}
}
