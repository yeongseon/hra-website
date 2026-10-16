/** 비공개 업로드 정리의 명시적 운영 진입점. 설정 전에는 저장소·DB에 접근하지 않는다. */
import { timingSafeEqual } from "node:crypto";
import { cleanupAcademicUploads } from "@/features/academics/assignment-uploads/cleanup";
import { uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
import { createAcademicObservation } from "@/lib/academic-observability";
export const runtime="nodejs";
export async function GET(request:Request){
  const observation=createAcademicObservation("UPLOAD_CLEANUP","UPLOAD_INTENT");
  const headers={"Cache-Control":"no-store","X-Request-Id":observation.correlationId};
  const secret=process.env.CRON_SECRET;const supplied=request.headers.get("authorization");
  if(!secret){observation.emit("FAILED",{failureCode:"GATE"});return Response.json({error:"정리 작업을 준비하고 있습니다.",referenceId:observation.correlationId},{status:503,headers});}
  const actual=Buffer.from(supplied?.startsWith("Bearer ")?supplied.slice(7):"");const expected=Buffer.from(secret);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected)){
    observation.emit("DENIED",{failureCode:"AUTHORIZATION"});return Response.json({error:"인증이 필요합니다.",referenceId:observation.correlationId},{status:401,headers});
  }
  try{return Response.json({...await cleanupAcademicUploads({dryRun:process.env.ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED!=="true"},observation),referenceId:observation.correlationId},{headers});}
  catch(error){return uploadErrorResponse(error,observation);}
}
