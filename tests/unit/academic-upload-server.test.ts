// @vitest-environment node
/** 실제 검증 서비스가 메타·스트림·시그니처·전체 크기·SHA256을 비교한 뒤에만 VERIFIED로 저장하는지 검사한다. */
import { createHash, createHmac } from "node:crypto";
import { afterEach,beforeEach,describe,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({target:vi.fn(),head:vi.fn(),get:vi.fn(),authorize:vi.fn(),persist:vi.fn(),reserve:vi.fn(),issue:vi.fn(),retire:vi.fn(),receipt:vi.fn(),record:vi.fn(),execute:vi.fn(),ipReserve:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/academic-permissions",()=>({requireAssignmentTarget:mocks.target,AcademicAccessError:class extends Error{status=403;code="FORBIDDEN";}}));
vi.mock("@vercel/blob",()=>({head:mocks.head,get:mocks.get}));
vi.mock("@/features/academics/assignment-uploads/repository",()=>({authorizeUploadRecord:mocks.authorize,persistUploadVerification:mocks.persist,reserveAssignmentUploadAttempt:mocks.reserve,issueUploadRecord:mocks.issue,retireUploadRecord:mocks.retire,getUploadReceiptRecord:mocks.receipt,recordUploadReceipt:mocks.record}));
vi.mock("@/lib/rate-limit",()=>({reserveUploadAttempt:mocks.ipReserve}));
vi.mock("@/lib/db",()=>({db:{execute:mocks.execute}}));
vi.mock("@/lib/auth",()=>({auth:vi.fn()}));
import { finalizeAssignmentSubmission } from "@/features/academics/submissions/service";
import { createAssignmentUploadIntent,authorizeAssignmentUploadToken,verifyAssignmentUploadIntent,cancelAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { AcademicUploadError,assignmentUploadInput,academicUploadPath,MAX_ASSIGNMENT_UPLOAD_BYTES } from "@/features/academics/assignment-uploads/contract";
import { DELETE as cancelRoute } from "@/app/api/academic/uploads/intents/[id]/route";
import { POST as callback } from "@/app/api/academic/uploads/route";
import { POST as createIntentRoute } from "@/app/api/academic/uploads/intents/route";
const id="10000000-0000-4000-8000-000000000001",assignmentId="20000000-0000-4000-8000-000000000001",targetId="30000000-0000-4000-8000-000000000001";
const selection={assignmentId,uploadIntentId:id};
const pathname=academicUploadPath(id),host="qa151.private.blob.vercel-storage.com";
const bytes=new TextEncoder().encode("%PDF-1.7\n시험 파일\n%%EOF");
const record=()=>({intent_id:id,target_id:targetId,user_id:id,original_name:"시험.pdf",expected_size:bytes.length,storage_key:pathname,expires_at:new Date(Date.now()+60000),state:"INTENDED",verified_etag:null});
const metadata=()=>({url:`https://${host}/${pathname}`,pathname,size:bytes.length,contentType:"application/pdf",etag:"etag-1"});
function stream(chunks:Uint8Array[]){return new ReadableStream<Uint8Array>({start(controller){for(const chunk of chunks)controller.enqueue(chunk);controller.close();}});}
function stored(chunks=[bytes]){return {statusCode:200,blob:metadata(),stream:stream(chunks)};}
beforeEach(()=>{
 vi.resetAllMocks();vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED","true");vi.stubEnv("ACADEMIC_ENABLED","true");vi.stubEnv("ACADEMIC_UPLOADS_ENABLED","true");vi.stubEnv("ACADEMIC_SUBMISSION_BLOB_HOST",host);vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN","vercel_blob_rw_qa151_fixture");
 vi.spyOn(console,"info").mockImplementation(()=>{});vi.spyOn(console,"error").mockImplementation(()=>{});
 mocks.target.mockResolvedValue({userId:id,targetId,assignmentId,status:"PUBLISHED",dueAt:new Date(Date.now()+120000)});
 mocks.authorize.mockImplementation(async()=>record());mocks.head.mockImplementation(async()=>metadata());mocks.get.mockImplementation(async()=>stored());mocks.issue.mockResolvedValue(id);mocks.ipReserve.mockResolvedValue({blocked:false,retryAfterSec:0});
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});
describe("과제 업로드 계약·실제 스트림 검증",()=>{
 it("의도 발급은 서버 참조를 응답·헤더·인가/완료 이벤트에 연결한다",async()=>{
  const result=await createIntentRoute(new Request("https://app.invalid/api/academic/uploads/intents",{method:"POST",headers:{Origin:"https://app.invalid"},
   body:JSON.stringify({assignmentId,requestId:id,originalName:"합성비공개이름.pdf",sizeBytes:bytes.length,mimeType:"application/pdf"})}));
  const body=await result.json();expect(result.status).toBe(200);expect(body.referenceId).toBe(result.headers.get("x-request-id"));
  expect(console.info).toHaveBeenLastCalledWith("[academic/events]",expect.objectContaining({
   action:"UPLOAD_INTENT",outcome:"COMPLETED",actorUserId:id,resourceId:id,requestId:id,correlationId:body.referenceId,
  }));
  expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("합성비공개이름");
 });
 it("인가 전 실패는 actor를 추정하지 않고 원본 오류·URL·토큰을 로거에 전달하지 않는다",async()=>{
  const secret=`synthetic@example.invalid https://${host}/${pathname} vercel_blob_rw_qa151_fixture`;
  mocks.target.mockRejectedValueOnce(new Error(secret));
  const result=await createIntentRoute(new Request("https://app.invalid/api/academic/uploads/intents",{method:"POST",headers:{Origin:"https://app.invalid"},
   body:JSON.stringify({assignmentId,requestId:id,originalName:"합성.pdf",sizeBytes:bytes.length,mimeType:"application/pdf"})}));
  const body=await result.json();expect(result.status).toBe(503);expect(body.referenceId).toBe(result.headers.get("x-request-id"));
  expect(console.error).toHaveBeenCalledTimes(1);
  expect(console.error).toHaveBeenCalledWith("[academic/events]",expect.objectContaining({context:expect.objectContaining({actorUserId:null})}));
  const output=JSON.stringify([body,vi.mocked(console.error).mock.calls]);
  for(const value of[secret,pathname,host,"vercel_blob_rw_qa151_fixture"])expect(output).not.toContain(value);
 });
 it.each([0,MAX_ASSIGNMENT_UPLOAD_BYTES+1])("잘못된 크기 %s는 의도 발급 전 거부한다",async sizeBytes=>{
  await expect(createAssignmentUploadIntent({assignmentId,requestId:id,originalName:"과제.pdf",sizeBytes,mimeType:"application/pdf"})).rejects.toMatchObject({code:"INVALID_FILE"});expect(mocks.issue).not.toHaveBeenCalled();
 });
 it("정확히50MiB·한글/대문자PDF 이름을 허용하고 경로·MIME 위장은 거부한다",()=>{
  const input={assignmentId,requestId:id,originalName:"한글.PDF",sizeBytes:MAX_ASSIGNMENT_UPLOAD_BYTES,mimeType:"application/pdf"};expect(assignmentUploadInput.safeParse(input).success).toBe(true);
  for(const change of [{originalName:"../과제.pdf"},{originalName:"과제.pdf\u0000"},{originalName:"과제.exe"},{mimeType:"image/png"}])expect(assignmentUploadInput.safeParse({...input,...change}).success).toBe(false);
 });
 it("마감 후 종료 과제 취소는 발급 승인 없이 기대 대상과 현재 세션을 DB로 전달한다",async()=>{
  mocks.target.mockResolvedValue({userId:id,targetId,assignmentId,status:"CLOSED",dueAt:new Date(0)});
  mocks.authorize.mockRejectedValue(new AcademicUploadError("EXPIRED"));
  await cancelAssignmentUploadIntent(selection);await cancelAssignmentUploadIntent(selection);
  expect(mocks.target).toHaveBeenCalledWith({assignmentId});expect(mocks.retire).toHaveBeenCalledWith(id,id,targetId);
  expect(mocks.retire).toHaveBeenCalledTimes(2);expect(mocks.authorize).not.toHaveBeenCalled();expect(mocks.head).not.toHaveBeenCalled();expect(mocks.get).not.toHaveBeenCalled();
 });
 it("취소 API는 과제와 다른 의도 404와 소비 충돌 409를 고정 응답으로 반환한다",async()=>{
  for(const [code,status]of [["NOT_FOUND",404],["CONFLICT",409]]as const){
   mocks.retire.mockRejectedValueOnce(new AcademicUploadError(code));
   const result=await cancelRoute(new Request("https://app.invalid/api/academic/uploads/intents/"+id,{method:"DELETE",headers:{Origin:"https://app.invalid","Content-Type":"application/json"},body:JSON.stringify({assignmentId})}),{params:Promise.resolve({id})});
   expect(result.status).toBe(status);expect(await result.json()).toMatchObject({code});
  }
 });
 it("비활성·세션 거부·잘못된 입력이면 취소 DB에 접근하지 않는다",async()=>{
  vi.stubEnv("ACADEMIC_UPLOADS_ENABLED","false");await expect(cancelAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"DISABLED"});
  vi.stubEnv("ACADEMIC_UPLOADS_ENABLED","true");await expect(cancelAssignmentUploadIntent({...selection,userId:id})).rejects.toMatchObject({code:"NOT_FOUND"});
  mocks.target.mockRejectedValueOnce(new Error("권한 거부"));await expect(cancelAssignmentUploadIntent(selection)).rejects.toThrow("권한 거부");expect(mocks.retire).not.toHaveBeenCalled();
 });
 it("여러 청크의 PDF 시그니처·전체 SHA256을 서버에서 계산한다",async()=>{
  mocks.get.mockResolvedValue(stored([bytes.subarray(0,2),bytes.subarray(2,4),bytes.subarray(4)]));
  await verifyAssignmentUploadIntent(selection);
  expect(mocks.get).toHaveBeenCalledWith(pathname,expect.objectContaining({access:"private",useCache:false}));
  expect(mocks.persist).toHaveBeenCalledWith(id,id,createHash("sha256").update(bytes).digest("hex"),"etag-1");
 });
 it("정확히50MiB의 원본을 전체 스트리밍해 검증한다",async()=>{
  const size=MAX_ASSIGNMENT_UPLOAD_BYTES;const prefix=new TextEncoder().encode("%PDF-");const zeros=new Uint8Array(1024*1024);
  mocks.authorize.mockResolvedValue({...record(),expected_size:size});mocks.head.mockResolvedValue({...metadata(),size});
  const hash=createHash("sha256");hash.update(prefix);let remaining=size-prefix.length;
  const chunks=[prefix];while(remaining>0){const chunk=zeros.subarray(0,Math.min(remaining,zeros.length));chunks.push(chunk);hash.update(chunk);remaining-=chunk.length;}
  mocks.get.mockResolvedValue({statusCode:200,blob:{...metadata(),size},stream:stream(chunks)});
  await verifyAssignmentUploadIntent(selection);expect(mocks.persist).toHaveBeenCalledWith(id,id,hash.digest("hex"),"etag-1");
 });
 it("이미 VERIFIED도 실제 객체를 다시 검증한다",async()=>{
  mocks.authorize.mockResolvedValue({...record(),state:"VERIFIED",verified_etag:"etag-1"});await verifyAssignmentUploadIntent(selection);await verifyAssignmentUploadIntent(selection);
  expect(mocks.persist).toHaveBeenCalledTimes(2);expect(mocks.get).toHaveBeenCalledTimes(2);
 });
 it.each(["signature","truncated","oversize","mime","host","etag"])("%s 불일치는 VERIFIED로 기록하지 않는다",async kind=>{
  if(kind==="signature")mocks.get.mockResolvedValue(stored([new Uint8Array(bytes.length)]));
  if(kind==="truncated")mocks.get.mockResolvedValue(stored([bytes.subarray(0,5)]));
  if(kind==="oversize")mocks.get.mockResolvedValue(stored([bytes,new Uint8Array(1)]));
  if(kind==="mime")mocks.head.mockResolvedValue({...metadata(),contentType:"image/png"});
  if(kind==="host")mocks.head.mockResolvedValue({...metadata(),url:`https://other.invalid/${pathname}`});
  if(kind==="etag")mocks.get.mockResolvedValue({...stored(),blob:{...metadata(),etag:"changed"}});
  await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"INVALID_FILE"});expect(mocks.persist).not.toHaveBeenCalled();
 });
 it("DB 최종 검증 실패와 객체 조회 실패는 원문을 노출하지 않는다",async()=>{
  mocks.persist.mockRejectedValueOnce(new Error("SELECT 비공개 이름 및 URL"));await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"UNAVAILABLE"});
  mocks.get.mockRejectedValueOnce(new Error("비공개 연결 비밀"));await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({message:"업로드를 처리할 수 없습니다. 잠시 후 다시 시도해 주세요."});
 });
 it("비활성·권한 거부·마감·타 대상은 스토리지 접근 전 거부한다",async()=>{
  vi.stubEnv("ACADEMIC_UPLOADS_ENABLED","false");await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"DISABLED"});expect(mocks.target).not.toHaveBeenCalled();
  vi.stubEnv("ACADEMIC_UPLOADS_ENABLED","true");mocks.target.mockRejectedValueOnce(new Error("권한 거부"));await expect(verifyAssignmentUploadIntent(selection)).rejects.toThrow("권한 거부");
  mocks.target.mockResolvedValueOnce({status:"CLOSED",dueAt:new Date(),targetId,userId:id});await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"EXPIRED"});
  mocks.authorize.mockResolvedValueOnce({...record(),target_id:assignmentId});await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"NOT_FOUND"});expect(mocks.head).not.toHaveBeenCalled();
 });
 it("토큰은 정확한 의도 경로·최대 크기·만료와 단일PUT만 허용한다",async()=>{
  const result=await authorizeAssignmentUploadToken(selection,pathname,false);expect(result).toMatchObject({maximumSizeInBytes:bytes.length,addRandomSuffix:false,allowOverwrite:false,allowedContentTypes:["application/pdf"]});
  await expect(authorizeAssignmentUploadToken(selection,"resource-uploads/wrong.pdf",false)).rejects.toMatchObject({code:"CONFLICT"});
  await expect(authorizeAssignmentUploadToken(selection,pathname,true)).rejects.toMatchObject({code:"CONFLICT"});
 });
 it.each([["NOT_FOUND",404],["UNAVAILABLE",503]]as const)("토큰 승인 %s는 같은 고정 HTTP 상태로 반환하고 토큰을 발급하지 않는다",async(code,status)=>{
  mocks.authorize.mockRejectedValueOnce(new AcademicUploadError(code));
  const response=await callback(new Request("https://app.invalid/api/academic/uploads",{method:"POST",headers:{Origin:"https://app.invalid","Content-Type":"application/json"},
   body:JSON.stringify({type:"blob.generate-client-token",payload:{pathname,multipart:false,clientPayload:JSON.stringify(selection)}})}));
  expect(response.status).toBe(status);const body=await response.json();expect(body).toMatchObject({code});expect(body).not.toHaveProperty("clientToken");expect(mocks.reserve).not.toHaveBeenCalled();
 });
 it("키 순서와 추가 속성을 가진 실제 HMAC callback을 재전송해도 정상 수신한다",async()=>{
  mocks.receipt.mockResolvedValue({storageKey:pathname});
  // 스키마 선언과 다른 키 순서 및 중첩 추가 속성도 원본 그대로 서명 검증해야 한다.
  const body={extra:"provider-extra",payload:{extra:"payload-extra",tokenPayload:JSON.stringify({uploadIntentId:id}),
    blob:{extra:"blob-extra",etag:"etag-1",contentDisposition:"attachment",contentType:"application/pdf",downloadUrl:`https://${host}/${pathname}?download=1`,pathname,url:`https://${host}/${pathname}`}},type:"blob.upload-completed"};
  const raw=JSON.stringify(body);const signature=createHmac("sha256","vercel_blob_rw_qa151_fixture").update(raw).digest("hex");
  for(let n=0;n<2;n++){
   const result=await callback(new Request("https://app.invalid/api/academic/uploads",{method:"POST",headers:{"Content-Type":"application/json","x-vercel-signature":signature},body:raw}));
   expect(result.status).toBe(200);
   expect(result.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
  }
  expect(mocks.record).toHaveBeenCalledTimes(2);expect(mocks.record).toHaveBeenCalledWith(id);expect(mocks.persist).not.toHaveBeenCalled();
  expect(console.info).toHaveBeenLastCalledWith("[academic/events]",expect.objectContaining({
   action:"UPLOAD_RECEIPT",outcome:"COMPLETED",actorUserId:null,resourceId:id,
  }));
 });
 it("실제 SDK가 잘못된 callback 서명을 거부하며 수신 원장을 변경하지 않는다",async()=>{
  const body={type:"blob.upload-completed",payload:{blob:{...metadata(),downloadUrl:`https://${host}/${pathname}?download=1`,contentDisposition:"attachment"},tokenPayload:JSON.stringify({uploadIntentId:id})}};
  const result=await callback(new Request("https://app.invalid/api/academic/uploads",{method:"POST",headers:{"Content-Type":"application/json","x-vercel-signature":"forged"},body:JSON.stringify(body)}));
  expect(result.status).toBeGreaterThanOrEqual(400);expect(mocks.receipt).not.toHaveBeenCalled();expect(mocks.record).not.toHaveBeenCalled();expect(await result.text()).not.toContain(host);
 });
});

// 같은 대상의 실제 단계 순서에서 예산을 초기화하지 않아 단계 중복 차감 회귀를 잡습니다.
describe("의도 발급과 외부 작업 예산 분리",()=>{
 const input={assignmentId,requestId:id,originalName:"과제.pdf",sizeBytes:bytes.length,mimeType:"application/pdf"};
 function budget(){
  const used={intent:0,external:0};
  mocks.reserve.mockImplementation(async(_user:string,_target:string,phase?:string)=>{
   const scope=phase==="intent"?"intent":"external";
   if(used[scope]>=4)throw new AcademicUploadError("RATE_LIMITED");
   used[scope]++;
  });
  return used;
 }
 async function start(){await createAssignmentUploadIntent(input);await authorizeAssignmentUploadToken(selection,pathname,false);}
 async function replacement(){
  const next={assignmentId,uploadIntentId:assignmentId},nextPath=academicUploadPath(assignmentId);
  mocks.issue.mockResolvedValue(assignmentId);
  mocks.authorize.mockImplementation(async()=>({...record(),intent_id:assignmentId,storage_key:nextPath}));
  mocks.head.mockImplementation(async()=>({...metadata(),pathname:nextPath,url:`https://${host}/${nextPath}`}));
  mocks.get.mockImplementation(async()=>({...stored(),blob:{...metadata(),pathname:nextPath,url:`https://${host}/${nextPath}`}}));
  await createAssignmentUploadIntent({...input,requestId:assignmentId});await authorizeAssignmentUploadToken(next,nextPath,false);
  return next;
 }
 it("정상 제출은 발급 한 번과 외부 작업 두 번을 예약한다",async()=>{
  const used=budget();await start();await verifyAssignmentUploadIntent(selection);
  expect(used).toEqual({intent:1,external:2});
 });
 it("PUT 실패 뒤 취소하고 새 의도로 다시 전송·검증해도 같은 창에 완료한다",async()=>{
  const used=budget();await start();await cancelAssignmentUploadIntent(selection);
  await verifyAssignmentUploadIntent(await replacement());
  expect(used).toEqual({intent:2,external:3});
 });
 it("전송 후 검증 실패는 같은 의도로 다시 검증하며 발급을 중복 차감하지 않는다",async()=>{
  const used=budget();await start();mocks.get.mockRejectedValueOnce(new Error("읽기 실패"));
  await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"UNAVAILABLE"});
  await verifyAssignmentUploadIntent(selection);expect(used).toEqual({intent:1,external:3});
 });
 it("검증에 실패한 파일을 취소·교체한 뒤 같은 창의 네 번째 외부 작업으로 검증한다",async()=>{
  const used=budget();await start();mocks.get.mockResolvedValueOnce(stored([new Uint8Array(bytes.length)]));
  await expect(verifyAssignmentUploadIntent(selection)).rejects.toMatchObject({code:"INVALID_FILE"});
  await cancelAssignmentUploadIntent(selection);const next=await replacement();await verifyAssignmentUploadIntent(next);
  expect(used).toEqual({intent:2,external:4});
  const reads=mocks.head.mock.calls.length;
  await expect(verifyAssignmentUploadIntent(next)).rejects.toMatchObject({code:"RATE_LIMITED"});
  expect(mocks.head).toHaveBeenCalledTimes(reads);
 });
});

it.each(["intent","token","ip"])("%s 차단 HTTP는 고정 코드·대기 초·Retry-After를 반환한다",async phase=>{
 if(phase==="ip")mocks.ipReserve.mockResolvedValue({blocked:true,retryAfterSec:37});
 else mocks.reserve.mockRejectedValueOnce(new AcademicUploadError("RATE_LIMITED",37));
 const response=phase==="intent"?await createIntentRoute(new Request("https://app.invalid/api/academic/uploads/intents",{method:"POST",headers:{Origin:"https://app.invalid"},body:JSON.stringify({assignmentId,requestId:id,originalName:"과제.pdf",sizeBytes:bytes.length,mimeType:"application/pdf"})}))
  :await callback(new Request("https://app.invalid/api/academic/uploads",{method:"POST",headers:{Origin:"https://app.invalid","Content-Type":"application/json"},body:JSON.stringify({type:"blob.generate-client-token",payload:{pathname,multipart:false,clientPayload:JSON.stringify(selection)}})}));
 expect(response.status).toBe(429);expect(response.headers.get("retry-after")).toBe("37");
 expect(await response.json()).toMatchObject({code:"RATE_LIMITED",retryAfterSeconds:37,error:expect.stringContaining("37초")});
});
it("성공 커밋의 같은 키 복구는 실제 검증기와 예산 예약을 다시 호출하지 않는다",async()=>{
 const dto={assignmentId,submissionId:assignmentId,submittedAt:new Date().toISOString(),replayed:false,file:{fileId:id,originalName:"과제.pdf",mimeType:"application/pdf",sizeBytes:bytes.length}};
 mocks.execute.mockResolvedValueOnce({rows:[{result:null}]}).mockResolvedValueOnce({rows:[{result:dto}]}).mockResolvedValueOnce({rows:[{result:{...dto,replayed:true}}]});
 await createAssignmentUploadIntent({assignmentId,requestId:id,originalName:"과제.pdf",sizeBytes:bytes.length,mimeType:"application/pdf"});
 await authorizeAssignmentUploadToken(selection,pathname,false);
 const request={...selection,submissionKey:id};
 await finalizeAssignmentSubmission(request);
 const reservations=mocks.reserve.mock.calls.slice();
 expect(reservations.map(call=>call[2])).toEqual(["intent","external","external"]);
 expect(await finalizeAssignmentSubmission(request)).toMatchObject({replayed:true,submissionId:assignmentId});
 expect(mocks.reserve.mock.calls).toEqual(reservations);expect(mocks.head).toHaveBeenCalledTimes(1);expect(mocks.get).toHaveBeenCalledTimes(1);
});
