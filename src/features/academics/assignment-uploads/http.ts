/** 과제 API의 작은 JSON 입력·동일 출처·고정 오류 응답 경계다. */
import "server-only";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { AcademicUploadError } from "./contract";
import type { AcademicObservation } from "@/lib/academic-observability";
import { recordUploadFailure } from "./observability";
export function assertUploadOrigin(request:Request):void {
  // NextURL은 127.0.0.1을 localhost로 정규화한다. 실제 HTTP Host를 우선해
  // 브라우저가 접속한 authority(포트 포함)를 비교하고 임의 forwarded-host는 신뢰하지 않는다.
  const requestUrl=new URL(request.url);
  const host=request.headers.get("host");
  let expectedOrigin=requestUrl.origin;
  if(host!==null){
    // Host 값은 authority 하나만 허용한다. 경로·사용자정보·여러 호스트를 URL로 재해석하지 않는다.
    if(!host || /[\s,/@\\?#]/.test(host))throw new AcademicUploadError("NOT_FOUND");
    try {expectedOrigin=new URL(`${requestUrl.protocol}//${host}`).origin;}
    catch {throw new AcademicUploadError("NOT_FOUND");}
  }
  if(request.headers.get("origin")!==expectedOrigin) throw new AcademicUploadError("NOT_FOUND");
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
