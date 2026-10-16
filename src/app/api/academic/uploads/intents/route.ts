/** 파일 본문 없이 인증된 과제 업로드 의도를 발급한다. */
import { createAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { assertUploadOrigin, readUploadJson, uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
import { createAcademicObservation } from "@/lib/academic-observability";
export const runtime="nodejs";
export async function POST(request:Request){
  const observation=createAcademicObservation("UPLOAD_INTENT","UPLOAD_INTENT");
  try{assertUploadOrigin(request);return Response.json({...await createAssignmentUploadIntent(await readUploadJson(request),observation),referenceId:observation.correlationId},
    {headers:{"Cache-Control":"no-store","X-Request-Id":observation.correlationId}});}
  catch(error){return uploadErrorResponse(error,observation);}
}
