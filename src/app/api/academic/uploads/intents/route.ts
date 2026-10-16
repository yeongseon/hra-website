/** 파일 본문 없이 인증된 과제 업로드 의도를 발급한다. */
import { createAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { assertUploadOrigin, readUploadJson, uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
export const runtime="nodejs";
export async function POST(request:Request){
  try{assertUploadOrigin(request);return Response.json(await createAssignmentUploadIntent(await readUploadJson(request)),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return uploadErrorResponse(error);}
}
