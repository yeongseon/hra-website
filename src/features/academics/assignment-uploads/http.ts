/** 과제 API의 작은 JSON 입력·동일 출처·고정 오류 응답 경계다. */
import "server-only";
import { isSameRequestOrigin } from "@/lib/request-origin";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { AcademicUploadError } from "./contract";
import type { AcademicObservation } from "@/lib/academic-observability";
import { recordUploadFailure } from "./observability";
export function assertUploadOrigin(request:Request):void {
  // 학사 업로드는 Origin을 필수로 유지하며 공통 Host 판정만 재사용합니다.
  if(!isSameRequestOrigin(request)) throw new AcademicUploadError("NOT_FOUND");
}
export async function readUploadJson(request:Request):Promise<unknown> {
  if(!request.body) throw new AcademicUploadError("INVALID_FILE");
  const reader=request.body.getReader();let size=0;const chunks:Uint8Array[]=[];
  try {
    for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.length;if(size>16*1024)throw new AcademicUploadError("INVALID_FILE");chunks.push(chunk.value);}
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch(error){if(error instanceof AcademicUploadError)throw error;throw new AcademicUploadError("INVALID_FILE");}
  finally {await reader.cancel();}
}
export function uploadErrorResponse(error:unknown, observation?: AcademicObservation):Response {
  if(observation)recordUploadFailure(observation,error);
  const safe=error instanceof AcademicUploadError || error instanceof AcademicAccessError ? error : new AcademicUploadError("UNAVAILABLE");
  return Response.json({error:safe.message,code:safe.code,...(observation?{referenceId:observation.correlationId}:{})},
    {status:safe.status,headers:{"Cache-Control":"no-store",...(observation?{"X-Request-Id":observation.correlationId}:{})}});
}
