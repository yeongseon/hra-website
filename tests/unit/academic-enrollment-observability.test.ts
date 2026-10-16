// @vitest-environment node
/** 학적 연결의 실제 서비스 인가·멱등 결과와 안전 이벤트의 관계를 확인합니다. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
import { linkAcademicEnrollments } from "@/features/academics/enrollments/actions";
const actor = "10000000-0000-4000-8000-000000000001";
const request = "20000000-0000-4000-8000-000000000001";
const plan = () => ({ requestId: request, approverUserId: actor, approvalReferenceId: actor,
  verificationMethod: "IN_PERSON", links: [{ studentId: actor,
    userId: "30000000-0000-4000-8000-000000000001", cohortId: actor, expectedRole: "MEMBER", expectedCohortId: null }] });
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", actor);
  vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "true");
  mocks.auth.mockResolvedValue({ user: { id: actor, role: "FACULTY" } });
  mocks.execute.mockResolvedValue({ rows: [{ result: { requestId: request, linkedCount: 1, enrolledCount: 1, replayed: true } }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe("학적 연결 요청 관측", () => {
  it("인증 후 actor와 검증된 요청ID만 연결하고 재실행을 새 참조로 남긴다", async () => {
    const result = await linkAcademicEnrollments(plan());
    expect(result).toMatchObject({ success: true, replayed: true });
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      actorUserId: actor, requestId: request, resourceId: request, outcome: "REPLAYED", correlationId: result.referenceId,
    }));
  });
  it("비로그인은 설정 계정을 actor로 기록하지 않습니다", async () => {
    mocks.auth.mockResolvedValue(null);
    const result = await linkAcademicEnrollments(plan());
    expect(result.success).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ context: expect.objectContaining({
      actorUserId: null, requestId: null, resourceId: null, outcome: "DENIED", correlationId: result.referenceId,
    }) }));
  });
  it("실제 Drizzle 오류와 임의 입력은 원본 로거로 전달되지 않습니다", async () => {
    const secret = "synthetic@example.invalid 합성비공개이름 https://private.invalid/test?token=secret";
    mocks.execute.mockRejectedValue(new DrizzleQueryError("SELECT apply_private($1)", [secret], new Error(secret)));
    const result = await linkAcademicEnrollments(plan());
    expect(result.success).toBe(false);
    const output = JSON.stringify([result, vi.mocked(console.error).mock.calls, vi.mocked(console.info).mock.calls]);
    for (const value of [secret, "SELECT", "apply_private", "params"]) expect(output).not.toContain(value);
    expect(vi.mocked(console.info).mock.calls.map(call => call[1])).not.toContainEqual(expect.objectContaining({ outcome: "COMPLETED" }));
  });
});
