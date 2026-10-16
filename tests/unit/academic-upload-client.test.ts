// @vitest-environment node
/** PUT 응답 유실 전에 의도 ID를 UI에 알려 같은 제출 요청으로 복구할 수 있는지 검사한다. */
import { afterEach,beforeEach,expect,it,vi } from "vitest";
const mocks=vi.hoisted(()=>({upload:vi.fn()}));vi.mock("@vercel/blob/client",()=>({upload:mocks.upload}));
import { uploadAssignmentFile } from "@/features/academics/assignment-uploads/client";
const id="10000000-0000-4000-8000-000000000001";
beforeEach(()=>vi.resetAllMocks());afterEach(()=>vi.unstubAllGlobals());
it("의도 ID를 PUT 전에 알리고 응답 유실 시에도 보존한다",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({uploadIntentId:id,pathname:`academic-uploads/v1/${id}/document.pdf`,expiresAt:new Date(Date.now()+60000).toISOString()})));
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
