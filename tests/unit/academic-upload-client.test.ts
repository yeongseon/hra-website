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
