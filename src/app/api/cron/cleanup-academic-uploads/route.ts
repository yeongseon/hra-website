/** 비공개 업로드 정리의 명시적 운영 진입점. 설정 전에는 저장소·DB에 접근하지 않는다. */
import { timingSafeEqual } from "node:crypto";
import { cleanupAcademicUploads } from "@/features/academics/assignment-uploads/cleanup";
import { uploadErrorResponse } from "@/features/academics/assignment-uploads/http";
export const runtime="nodejs";
export async function GET(request:Request){
  const secret=process.env.CRON_SECRET;const supplied=request.headers.get("authorization");
  if(!secret)return Response.json({error:"정리 작업을 준비하고 있습니다."},{status:503});
  const actual=Buffer.from(supplied?.startsWith("Bearer ")?supplied.slice(7):"");const expected=Buffer.from(secret);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))return Response.json({error:"인증이 필요합니다."},{status:401});
  try{return Response.json(await cleanupAcademicUploads({dryRun:process.env.ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED!=="true"}),{headers:{"Cache-Control":"no-store"}});}
  catch(error){return uploadErrorResponse(error);}
}
