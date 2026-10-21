// @vitest-environment node
/** 업로드 DB 오류의 정확한 SQLSTATE·고정 코드만 공개하고 실제 장애와 알 수 없는 예외는 503으로 숨긴다. */
import { beforeEach, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({execute:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/db",()=>({db:{execute:mocks.execute}}));
import { authorizeUploadRecord, reserveAssignmentUploadAttempt } from "@/features/academics/assignment-uploads/repository";

const intent="10000000-0000-4000-8000-000000000001",actor="20000000-0000-4000-8000-000000000001";
beforeEach(()=>vi.resetAllMocks());

it("예상 소유권 거부는 Drizzle cause를 거쳐도 개인정보 없는 404다",async()=>{
  const databaseError=Object.assign(new Error("upload_not_found"),{code:"P0001"});
  mocks.execute.mockRejectedValueOnce(new Error("SQL과 비공개 매개변수",{cause:databaseError}));
  await expect(authorizeUploadRecord(intent,actor)).rejects.toMatchObject({code:"NOT_FOUND",status:404});
});

it.each([
  {code:"P0001",message:"알 수 없는 소유권 검사 실패"},
  {code:"P0001",message:"upload_not_found 추가 원문"},
  {code:"08006",message:"upload_not_found"},
  {code:"55P03",message:"잠금 시간 초과"},
  {code:"42P01",message:"테이블 없음"},
])("실제 장애·알 수 없는 예외 $code/$message는 503으로 남긴다",async input=>{
  mocks.execute.mockRejectedValueOnce(Object.assign(new Error(input.message),{code:input.code}));
  await expect(authorizeUploadRecord(intent,actor)).rejects.toMatchObject({code:"UNAVAILABLE",status:503,
    message:"업로드를 처리할 수 없습니다. 잠시 후 다시 시도해 주세요."});
});

it.each([
 {allowed:true,retry_after_sec:null},
 {allowed:false,retry_after_sec:null},
 {allowed:true,retry_after_sec:"0"},
 {allowed:false,retry_after_sec:"37"},
 {allowed:true},
])("잘못된 예약 결과 $allowed/$retry_after_sec는 검증 가능한 503으로 차단한다",async row=>{
 mocks.execute.mockResolvedValueOnce({rows:[row]});
 await expect(reserveAssignmentUploadAttempt(actor,intent,"external")).rejects.toMatchObject({code:"UNAVAILABLE",status:503});
});
