// @vitest-environment node
/** 과제 액션의 실제 세션 인가·입력 검증·한국어 결과·캐시 무효화 경계를 검증합니다. */
import { PgDialect } from "drizzle-orm/pg-core";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn(), revalidate: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import * as actions from "@/features/academics/assignments/actions";
import * as service from "@/features/academics/assignments/service";
import { parseAssignmentKst } from "@/features/academics/assignments/validation";
import { sanitizeError } from "@/lib/errors";

const actor = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const assignment = "20000000-0000-4000-8000-000000000001";
const cohort = "30000000-0000-4000-8000-000000000001";
const request = "40000000-0000-4000-8000-000000000001";
const updatedAt = "2026-10-16T01:02:03.123456+00:00";
const draft = () => ({ requestId: request, cohortId: cohort, title: " 과제 제목 ",
  instructions: "과제 안내", dueAtKst: "2026-12-31T23:59:59" });
const publication = () => ({ requestId: request, assignmentId: assignment, expectedUpdatedAt: updatedAt, expectedTargetFingerprint: "a".repeat(64) });
const record = () => ({ id: assignment, cohort_id: cohort, schedule_event_id: null,
  schedule_session_id: null, title: "과제 제목", instructions: "과제 안내", due_at: "2026-12-31T14:59:59+00:00",
  status: "DRAFT", created_by_user_id: actor, published_by_user_id: null, published_at: null,
  created_at: updatedAt, updated_at: updatedAt });

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", actor);
  vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "true");
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  mocks.auth.mockResolvedValue({ user: { id: actor, role: "FACULTY" } });
  mocks.execute.mockResolvedValue({ rows: [{ result: { assignment: record(), targetCount: 0, replayed: false } }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("과제 액션·서비스 경계", () => {
  it("클라이언트 추적값 대신 서버 참조를 DB 감사와 응답에 연결하고 같은 요청 재실행을 구별한다", async () => {
    const clientCorrelation = "70000000-0000-4000-8000-000000000001";
    const first = await actions.createAssignment({ ...draft(), correlationId: clientCorrelation });
    expect(first.referenceId).not.toBe(clientCorrelation);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.params).toContain(first.referenceId);
    expect(query.params).not.toContain(clientCorrelation);
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      actorUserId: actor, outcome: "COMPLETED", correlationId: first.referenceId, requestId: request,
    }));
    mocks.execute.mockResolvedValue({ rows: [{ result: { assignment: record(), targetCount: 0, replayed: true } }] });
    const replay = await actions.createAssignment(draft());
    expect(replay.referenceId).not.toBe(first.referenceId);
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      outcome: "REPLAYED", correlationId: replay.referenceId, requestId: request,
    }));
  });

  it("인증 전 실패는 지정 승인자를 actor로 기록하지 않고 감사 실패는 완료로 기록하지 않는다", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    const denied = await actions.createAssignment(draft());
    expect(console.error).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      context: expect.objectContaining({ outcome: "DENIED", actorUserId: null, correlationId: denied.referenceId }),
    }));
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.execute.mockRejectedValue(new Error("감사 INSERT 실패 합성비공개본문"));
    await actions.createAssignment(draft());
    expect(vi.mocked(console.info).mock.calls.map(call => call[1])).not.toContainEqual(expect.objectContaining({ outcome: "COMPLETED" }));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("합성비공개본문");
  });
  it.each([
    ["create", () => actions.createAssignment(draft())],
    ["update", () => actions.updateDraftAssignment({ ...draft(), assignmentId: assignment, expectedUpdatedAt: updatedAt })],
    ["publish", () => actions.publishAssignment(publication())],
    ["close", () => actions.closeAssignment({ requestId: request, assignmentId: assignment })],
  ] as const)("%s 성공은 한국어 결과와 관리·학생 경로 갱신을 반환한다", async (_name, run) => {
    expect(await run()).toMatchObject({ success: true, assignment: { id: assignment, updatedAt }, targetCount: 0 });
    expect(mocks.revalidate.mock.calls.map(call => call[0])).toEqual([
      "/admin/academics/assignments", `/admin/academics/assignments/${assignment}`,
      `/admin/academics/assignments/${assignment}/submissions`, "/member/assignments", `/member/assignments/${assignment}`,
    ]);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.params).toContain(actor);
    expect(query.sql).toContain("mutate_academic_assignment");
  });

  it.each([null, { user: { id: other, role: "ADMIN" } }, { user: { id: actor, role: "PENDING" } }])(
    "미로그인·미지정 ADMIN·승인대기는 모든 액션과 목록에서 거부한다 (%j)", async session => {
      mocks.auth.mockResolvedValue(session);
      for (const run of [() => actions.createAssignment(draft()),
        () => actions.updateDraftAssignment({ ...draft(), assignmentId: assignment, expectedUpdatedAt: updatedAt }),
        () => actions.publishAssignment(publication()),
        () => actions.closeAssignment({ requestId: request, assignmentId: assignment }),
        () => actions.listAssignmentsAdmin()]) {
        expect(await run()).toMatchObject({ success: false });
      }
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });

  it("저장 비활성·임의 actor·잘못된 UUID·제목/본문 길이·세션 단독 입력을 거부한다", async () => {
    vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "false");
    expect(await actions.createAssignment(draft())).toMatchObject({ success: false });
    vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "true");
    for (const input of [{ ...draft(), actorUserId: actor }, { ...draft(), cohortId: "bad-id" },
      { ...draft(), title: " " }, { ...draft(), title: "가".repeat(201) },
      { ...draft(), instructions: "가".repeat(50001) }, { ...draft(), scheduleSessionId: other }]) {
      expect(await actions.createAssignment(input)).toMatchObject({ success: false });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("공개 플래그가 꺼져 있으면 모든 변경과 목록을 DB 호출 전에 차단한다", async () => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    for (const run of [() => actions.createAssignment(draft()),
      () => actions.updateDraftAssignment({ ...draft(), assignmentId: assignment, expectedUpdatedAt: updatedAt }),
      () => actions.publishAssignment(publication()),
      () => actions.closeAssignment({ requestId: request, assignmentId: assignment }), () => actions.listAssignmentsAdmin()]) {
      expect(await run()).toMatchObject({ success: false, message: "학사 기능을 준비 중입니다." });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("KST를 UTC로 전달하고 초안 마감 생략과 정밀 updatedAt을 보존한다", async () => {
    vi.stubEnv("TZ", "America/Los_Angeles");
    await service.createAssignment(draft());
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    const payload = query.params.find((value): value is string => typeof value === "string" && value.startsWith("{"));
    expect(JSON.parse(payload ?? "{}")).toMatchObject({ title: "과제 제목", dueAt: "2026-12-31T14:59:59.000Z" });
    expect(await service.createAssignment({ requestId: request, cohortId: cohort, title: "마감 미정 초안" }))
      .toMatchObject({ assignment: { updatedAt } });
    expect(parseAssignmentKst("2028-02-29T00:00")).toBe("2028-02-28T15:00:00.000Z");
    for (const invalid of ["2026-02-29T12:00", "2026-04-31T12:00", "2026-10-16T24:00", "2026-10-16T12:60",
      "2026-10-16T12:00:60", "2026-10-16T12:00+09:00", "bad-input"]) {
      expect(parseAssignmentKst(invalid)).toBeNull();
      expect(await actions.createAssignment({ ...draft(), dueAtKst: invalid })).toMatchObject({ success: false });
    }
  });

  it("DB 오류의 원문·PII를 응답에 포함하지 않고 실패 경로를 갱신하지 않는다", async () => {
    mocks.execute.mockRejectedValue(new Error("private@example.invalid SQL query secret-title"));
    const response = await actions.publishAssignment(publication());
    expect(response).toMatchObject({ success: false });
    expect(JSON.stringify(response)).not.toContain("private@example.invalid");
    expect(mocks.revalidate).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it.each(["mutation", "list"])("실제 DrizzleQueryError의 SQL·params·합성 개인정보는 %s 서버 로그에 남지 않는다", async route => {
    const email = "assignment-log-fixture@example.invalid";
    const body = "합성비공개본문-로그유출검증";
    const query = "SELECT public.mutate_academic_assignment($1, $2, $3, $4, $5, $6)";
    const error = new DrizzleQueryError(query, [email, body],
      Object.assign(new Error(`params: ${email}, ${body}`), { code: "XX000" }));
    // 테스트 입력은 실제 Drizzle가 message에 SQL과 바인딩 값을 포함하는 형태입니다.
    expect(error.message).toContain(email);
    expect(error.message).toContain(body);
    mocks.execute.mockRejectedValue(error);
    const response = route === "mutation" ? await actions.createAssignment({ ...draft(), title: email, instructions: body })
      : await actions.listAssignmentsAdmin();
    expect(response.success).toBe(false);
    expect(response.message).toBe(route === "mutation"
      ? "과제를 처리하지 못했습니다. 권한·마감·현재 상태를 확인한 뒤 다시 시도해 주세요."
      : "과제 목록을 불러오지 못했습니다. 권한과 조회 조건을 확인해 주세요.");
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    for (const secret of [email, body, query, "SELECT", "params", "mutate_academic_assignment"]) {
      expect(output).not.toContain(secret);
      expect(JSON.stringify(response)).not.toContain(secret);
    }
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      context: expect.objectContaining({ sqlState: "XX000" }),
      error: sanitizeError(new Error("학사 요청 처리 실패")),
    }));
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("알 수 없는 키 이름도 검증 오류 응답에 복사하지 않는다", async () => {
    const response = await actions.createAssignment({ ...draft(), "주세요 private@example.invalid": "입력" });
    expect(response).toMatchObject({ success: false, message: "과제 입력값을 확인해 주세요." });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("공개는 초안 버전과 명부 확인값이 모두 필요하다", async () => {
    for (const input of [{ requestId: request, assignmentId: assignment },
      { ...publication(), expectedUpdatedAt: "잘못된 날짜" },
      { ...publication(), expectedTargetFingerprint: "잘못된 확인값" }]) {
      expect(await actions.publishAssignment(input)).toMatchObject({ success: false });
    }
    expect(mocks.execute).not.toHaveBeenCalled();
    mocks.execute.mockRejectedValue({ cause: { code: "HRA09" } });
    expect(await actions.publishAssignment(publication())).toMatchObject({
      success: false, message: "공개 대상 명부가 변경되었습니다. 미리보기를 다시 확인해 주세요.",
    });
  });

  it.each([["HRA05", "최신 내용"], ["HRA08", "미래"], ["HRA04", "수정할 수 없습니다"]])(
    "알려진 DB 상태 %s를 입력 원문 없이 한국어 사유로 돌려준다", async (code, reason) => {
      mocks.execute.mockRejectedValue({ cause: { code, message: "private@example.invalid" } });
      const response = await actions.publishAssignment(publication());
      expect(response.success).toBe(false);
      expect(response.message).toContain(reason);
      expect(JSON.stringify(response)).not.toContain("private@example.invalid");
      expect(mocks.revalidate).not.toHaveBeenCalled();
    });

  it("조회는 지정 책임자에게만 최대100건을 허용하고 상태·기수를 바인딩한다", async () => {
    expect(await actions.listAssignmentsAdmin({ cohortId: cohort, status: "DRAFT", limit: 10 }))
      .toMatchObject({ success: true, assignments: [{ assignment: { id: assignment } }] });
    expect(mocks.revalidate).not.toHaveBeenCalled();
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.params).toContain(cohort);
    expect(query.params).toContain("DRAFT");
    expect(await actions.listAssignmentsAdmin({ limit: 101 })).toMatchObject({ success: false });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });
});
