// @vitest-environment node
/** 실제 세션 경계와 최종화 서비스의 검증 순서·복구·로그·객체 보존을 검증합니다. */
import { DrizzleQueryError } from "drizzle-orm/errors";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),lookup:vi.fn(),execute:vi.fn(),verify:vi.fn(),remove:vi.fn(),revalidate:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/auth",()=>({auth:mocks.auth}));
vi.mock("@/lib/db",()=>({db:{execute:mocks.execute,select:()=>{
  const builder={innerJoin:()=>builder,where:()=>builder,limit:mocks.lookup};
  return {from:()=>builder};
}}}));
vi.mock("@/features/academics/assignment-uploads/server",()=>({verifyAssignmentUploadIntent:mocks.verify}));
vi.mock("@vercel/blob",()=>({del:mocks.remove}));
vi.mock("next/cache",()=>({revalidatePath:mocks.revalidate}));

import { finalizeAssignmentSubmission } from "@/features/academics/submissions/actions";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";

const user="10000000-0000-4000-8000-000000000001";
const assignment="20000000-0000-4000-8000-000000000001";
const target="30000000-0000-4000-8000-000000000001";
const intent="40000000-0000-4000-8000-000000000001";
const key="50000000-0000-4000-8000-000000000001";
const request=()=>({assignmentId:assignment,uploadIntentId:intent,submissionKey:key});
const dto=()=>({assignmentId:assignment,submissionId:"60000000-0000-4000-8000-000000000001",
  submittedAt:"2026-10-16T09:00:00.123456+00:00",replayed:false,
  file:{fileId:"70000000-0000-4000-8000-000000000001",originalName:"과제.pdf",mimeType:"application/pdf",sizeBytes:2048}});
const targetRow=()=>({assignmentId:assignment,targetId:target,status:"PUBLISHED",
  dueAt:new Date("2035-01-01T00:00:00Z"),publishedAt:new Date("2026-01-01T00:00:00Z")});

beforeEach(()=>{
  vi.resetAllMocks();
  vi.spyOn(console,"error").mockImplementation(()=>{});
  vi.spyOn(console,"info").mockImplementation(()=>{});
  vi.stubEnv("ACADEMIC_ENABLED","true");
  vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED","true");
  vi.stubEnv("ACADEMIC_UPLOADS_ENABLED","true");
  mocks.auth.mockResolvedValue({user:{id:user,role:"MEMBER"}});
  mocks.lookup.mockResolvedValue([targetRow()]);
  mocks.execute.mockResolvedValueOnce({rows:[{result:null}]}).mockResolvedValue({rows:[{result:dto()}]});
  mocks.verify.mockResolvedValue(undefined);
});
afterEach(()=>{vi.unstubAllEnvs();vi.restoreAllMocks();});

describe("제출 최종화 액션",()=>{
  it("본인 확인→기존 결과 조회→실제 검증기→재인가→원자 확정 순서를 지킨다",async()=>{
    const result=await finalizeAssignmentSubmission(request());
    expect(result).toMatchObject({success:true,...dto()});
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]",expect.objectContaining({
      action:"SUBMISSION_FINALIZE",outcome:"COMPLETED",actorUserId:user,resourceId:dto().submissionId,
      requestId:key,correlationId:result.referenceId,
    }));
    expect(mocks.lookup).toHaveBeenCalledTimes(2);
    expect(mocks.verify).toHaveBeenCalledWith({assignmentId:assignment,uploadIntentId:intent},
      expect.objectContaining({correlationId:result.referenceId}));
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.verify.mock.invocationCallOrder[0]);
    expect(mocks.verify.mock.invocationCallOrder[0]).toBeLessThan(mocks.execute.mock.invocationCallOrder[1]);
    const dialect=new PgDialect();
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[0][0]).params).toEqual([target,user,intent,key,false]);
    expect(dialect.sqlToQuery(mocks.execute.mock.calls[1][0]).params).toEqual([target,user,intent,key,true]);
    expect(mocks.revalidate.mock.calls.map(call=>call[0])).toEqual(["/member/assignments",`/member/assignments/${assignment}`,
      "/admin/academics/assignments",`/admin/academics/assignments/${assignment}/submissions`]);
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("마감·종료·업로드/쓰기 중단 뒤 성공 재시도는 Blob 요청 없이 같은 완료를 복구한다",async()=>{
    mocks.execute.mockReset().mockResolvedValue({rows:[{result:{...dto(),replayed:true}}]});
    mocks.lookup.mockResolvedValue([{...targetRow(),status:"CLOSED",dueAt:new Date("2026-01-02T00:00:00Z")}]);
    vi.stubEnv("ACADEMIC_UPLOADS_ENABLED","false");vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED","false");
    mocks.verify.mockRejectedValue(new AcademicUploadError("UNAVAILABLE"));
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:true,...dto(),replayed:true});
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]",expect.objectContaining({outcome:"REPLAYED",actorUserId:user}));
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
  });

  it.each([null,{user:{id:user,role:"PENDING"}},{user:{id:user,role:"ADMIN"}},{user:{id:user,role:"FACULTY"}}])(
    "미로그인·학생 역할이 아닌 세션은 DB/Blob 전 거부한다 (%j)",async session=>{
      mocks.auth.mockResolvedValue(session);
      expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false});
      expect(console.error).toHaveBeenLastCalledWith("[academic/events]",expect.objectContaining({context:expect.objectContaining({outcome:"DENIED",actorUserId:null})}));
      expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();expect(mocks.remove).not.toHaveBeenCalled();
    });

  it("기능 비활성·본인 대상 없음은 최종화 SQL과 Blob을 호출하지 않는다",async()=>{
    vi.stubEnv("ACADEMIC_ENABLED","false");
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false,status:404});
    expect(mocks.lookup).not.toHaveBeenCalled();
    vi.stubEnv("ACADEMIC_ENABLED","true");mocks.lookup.mockResolvedValue([]);
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false,status:404});
    expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("잘못된 UUID·추가 사용자/저장 키 입력은 거부한다",async()=>{
    for(const input of [{...request(),submissionKey:"bad"},{...request(),userId:user},{...request(),storageKey:"private/path"}]) {
      expect(await finalizeAssignmentSubmission(input)).toMatchObject({success:false,status:422});
    }
    expect(mocks.execute).not.toHaveBeenCalled();expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("새 제출의 쓰기 중단은 검증과 최종 확정 전에 차단한다",async()=>{
    vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED","false");
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false,status:404});
    expect(mocks.execute).toHaveBeenCalledTimes(1);expect(mocks.verify).not.toHaveBeenCalled();
  });

  it.each(["NOT_FOUND","NOT_READY","EXPIRED","INVALID_FILE","UNAVAILABLE"] as const)(
    "실제 검증기 %s 실패는 최종 DB 쓰기와 객체 삭제를 하지 않는다",async code=>{
      mocks.verify.mockRejectedValue(new AcademicUploadError(code));
      expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false,code});
      expect(mocks.execute).toHaveBeenCalledTimes(1);expect(mocks.remove).not.toHaveBeenCalled();expect(mocks.revalidate).not.toHaveBeenCalled();
    });

  it("객체 검증 중 승인 취소·대상 변경은 최종 SQL 전에 차단한다",async()=>{
    mocks.lookup.mockResolvedValueOnce([targetRow()]).mockResolvedValueOnce([]);
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false,status:404});
    expect(mocks.execute).toHaveBeenCalledTimes(1);expect(mocks.remove).not.toHaveBeenCalled();
    mocks.lookup.mockReset().mockResolvedValueOnce([targetRow()]).mockResolvedValueOnce([{...targetRow(),targetId:"30000000-0000-4000-8000-000000000002"}]);
    mocks.execute.mockReset().mockResolvedValue({rows:[{result:null}]});
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false,status:404});
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it.each([["SUB01",409],["SUB02",404],["SUB03",409],["SUB04",409],["SUB05",409],["23505",409]])(
    "DB 상태 %s는 고정 응답 %s이고 객체는 유지한다",async(code,status)=>{
      mocks.execute.mockReset().mockResolvedValueOnce({rows:[{result:null}]}).mockRejectedValueOnce({cause:{code,message:"민감한 SQL 원문"}});
      const response=await finalizeAssignmentSubmission(request());
      expect(response).toMatchObject({success:false,status});expect(JSON.stringify(response)).not.toContain("민감한");
      expect(mocks.remove).not.toHaveBeenCalled();
    });

  it("DB 성공 응답 유실은 같은 키로 Blob 없이 기존 성공을 복구한다",async()=>{
    mocks.execute.mockReset().mockResolvedValueOnce({rows:[{result:null}]}).mockRejectedValueOnce(new Error("응답 유실"))
      .mockResolvedValue({rows:[{result:{...dto(),replayed:true}}]});
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:false,status:503});
    expect(await finalizeAssignmentSubmission(request())).toMatchObject({success:true,submissionId:dto().submissionId,submittedAt:dto().submittedAt,replayed:true});
    expect(mocks.verify).toHaveBeenCalledTimes(1);expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("실제 Drizzle 오류의 params·합성 개인정보는 응답과 실제 서버 로그에 남지 않는다",async()=>{
    const email="finalization-fixture@example.invalid";const privateBody="합성비공개본문";
    const raw=new DrizzleQueryError("SELECT public.complete_academic_assignment_submission($1)",[email,privateBody],new Error(`params:${email}`));
    expect(raw.message).toContain(email);
    mocks.execute.mockReset().mockResolvedValueOnce({rows:[{result:null}]}).mockRejectedValueOnce(raw);
    const failed=await finalizeAssignmentSubmission(request());
    expect(failed).toMatchObject({success:false,status:503});
    // 커밋 후 캐시 오류 같은 예상외 실패도 원본을 logger에 전달하지 않습니다.
    mocks.execute.mockReset().mockResolvedValue({rows:[{result:{...dto(),replayed:true}}]});
    mocks.revalidate.mockImplementation(()=>{throw raw;});
    const cacheFailure=await finalizeAssignmentSubmission(request());
    expect(cacheFailure).toMatchObject({success:false,status:503});
    expect(console.error).toHaveBeenCalledWith("[academic/events]",expect.objectContaining({
      error:expect.objectContaining({name:"Error",message:"학사 요청 처리 실패"}),
      context:expect.objectContaining({action:"SUBMISSION_FINALIZE",requestId:key,actorUserId:user,correlationId:cacheFailure.referenceId}),
    }));
    const output=JSON.stringify([failed,cacheFailure,vi.mocked(console.error).mock.calls]);
    for(const secret of[email,privateBody,"SELECT","params","complete_academic_assignment_submission"])expect(output).not.toContain(secret);
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
