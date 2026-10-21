// @vitest-environment node
/** PUT 응답 유실 전에 의도 ID를 UI에 알려 같은 제출 요청으로 복구할 수 있는지 검사한다. */
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({upload:vi.fn()}));vi.mock("@vercel/blob/client",()=>({put:mocks.upload}));
import { uploadAssignmentFile } from "@/features/academics/assignment-uploads/client";
const id="10000000-0000-4000-8000-000000000001";
beforeEach(()=>vi.resetAllMocks());afterEach(()=>vi.unstubAllGlobals());
it("의도 ID를 PUT 전에 알리고 응답 유실 시에도 보존한다",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(Response.json({uploadIntentId:id,pathname:`academic-uploads/v1/${id}/document.pdf`,expiresAt:new Date(Date.now()+60000).toISOString()})).mockResolvedValueOnce(Response.json({clientToken:"vercel_blob_client_qa_fixture"})));
 const intent=vi.fn();mocks.upload.mockImplementation(async()=>{expect(intent).toHaveBeenCalledWith(id);throw new Error("PUT 응답 유실");});
 await expect(uploadAssignmentFile({assignmentId:id,file:new File(["%PDF-1.7"],"과제.pdf",{type:"application/pdf"}),onIntent:intent})).rejects.toThrow("응답 유실");
 expect(intent).toHaveBeenCalledTimes(1);
});
it("HTTP 실패의 referenceId만 전달하고 원본 메시지나 입력 요청 ID를 사용하지 않는다",async()=>{
 const reference="20000000-0000-4000-8000-000000000001";const onRequestReference=vi.fn();
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({referenceId:reference,error:"SELECT synthetic@example.invalid",requestId:id},{status:503})));
 await expect(uploadAssignmentFile({assignmentId:id,requestId:id,file:new File(["%PDF-1.7"],"과제.pdf",{type:"application/pdf"}),onRequestReference})).rejects.toThrow("업로드를 승인받지 못했습니다.");
 expect(onRequestReference).toHaveBeenCalledExactlyOnceWith(reference);expect(mocks.upload).not.toHaveBeenCalled();
});
it.each([undefined,"https://private.invalid/token","synthetic@example.invalid",{referenceId:id}])("잘못된 서버 참조 %j는 입력 UUID로 대체하지 않는다",async referenceId=>{
 const onRequestReference=vi.fn();vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({referenceId,requestId:id},{status:503})));
 await expect(uploadAssignmentFile({assignmentId:id,requestId:id,file:new File(["%PDF-1.7"],"과제.pdf",{type:"application/pdf"}),onRequestReference})).rejects.toThrow("업로드를 승인받지 못했습니다.");
 expect(onRequestReference).not.toHaveBeenCalled();
});

// 의도 API와 SDK 토큰 API의 차단을 같은 공개 오류 계약으로 연결합니다.
it.each(["intent","token"])("%s 429는 대기 시간·안전한 안내·참조를 유지하고 PUT을 시작하지 않는다",async phase=>{
 const reference="20000000-0000-4000-8000-000000000001",onRequestReference=vi.fn(),onIntent=vi.fn();
 const request=vi.fn();
 if(phase==="token")request.mockResolvedValueOnce(Response.json({uploadIntentId:id,pathname:`academic-uploads/v1/${id}/document.pdf`,expiresAt:new Date(Date.now()+60000).toISOString()}));
 request.mockResolvedValueOnce(Response.json({code:"RATE_LIMITED",retryAfterSeconds:37,referenceId:reference,error:"SELECT private.invalid"},{status:429}));
 vi.stubGlobal("fetch",request);
 const result=uploadAssignmentFile({assignmentId:id,file:new File(["%PDF-1.7"],"과제.pdf",{type:"application/pdf"}),onIntent,onRequestReference});
 await expect(result).rejects.toMatchObject({code:"RATE_LIMITED",retryAfterSeconds:37});
 await expect(result).rejects.toThrow("37초 후 같은 요청으로 제출 결과를 다시 확인");
 await expect(result).rejects.toThrow("기존 업로드를 취소한 뒤 새로");
 expect(mocks.upload).not.toHaveBeenCalled();expect(onRequestReference).toHaveBeenCalledExactlyOnceWith(reference);
 expect(onIntent).toHaveBeenCalledTimes(phase==="token"?1:0);
});
it("토큰 교환 뒤 공개 SDK put에 제한된 client token과 단일 PUT·진행률·취소 신호를 전달한다",async()=>{
 const request=vi.fn().mockResolvedValueOnce(Response.json({uploadIntentId:id,pathname:`academic-uploads/v1/${id}/document.pdf`,expiresAt:new Date(Date.now()+60000).toISOString()}))
  .mockResolvedValueOnce(Response.json({clientToken:"vercel_blob_client_qa_fixture"}));
 vi.stubGlobal("fetch",request);mocks.upload.mockResolvedValue({url:"버려야 하는 반환 URL"});
 const signal=new AbortController().signal,onProgress=vi.fn(),file=new File(["%PDF-1.7"],"과제.pdf",{type:"application/pdf"});
 expect(await uploadAssignmentFile({assignmentId:id,file,abortSignal:signal,onProgress})).toEqual({uploadIntentId:id});
 expect(JSON.parse(request.mock.calls[1][1].body)).toEqual({type:"blob.generate-client-token",payload:{pathname:`academic-uploads/v1/${id}/document.pdf`,multipart:false,clientPayload:JSON.stringify({assignmentId:id,uploadIntentId:id})}});
 expect(mocks.upload).toHaveBeenCalledWith(`academic-uploads/v1/${id}/document.pdf`,file,expect.objectContaining({token:"vercel_blob_client_qa_fixture",access:"private",multipart:false,abortSignal:signal}));
 mocks.upload.mock.calls[0][2].onUploadProgress({percentage:42});expect(onProgress).toHaveBeenCalledWith(42);
});
it.each([0,61,"37",null])("잘못된 차단 대기 값 %j는 보수적인 60초로 안내한다",async retryAfterSeconds=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({code:"RATE_LIMITED",retryAfterSeconds},{status:429})));
 await expect(uploadAssignmentFile({assignmentId:id,file:new File(["%PDF-1.7"],"과제.pdf",{type:"application/pdf"})})).rejects.toMatchObject({retryAfterSeconds:60});
});
it("429가 아닌 오류의 대기 시간은 신뢰하지 않는다",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({code:"UNAVAILABLE",retryAfterSeconds:37},{status:503})));
 const failure=await uploadAssignmentFile({assignmentId:id,file:new File(["%PDF-1.7"],"과제.pdf",{type:"application/pdf"})}).catch((error:unknown)=>error);
 expect(failure).not.toHaveProperty("retryAfterSeconds");expect(failure).toMatchObject({message:expect.not.stringContaining("37초")});
});
