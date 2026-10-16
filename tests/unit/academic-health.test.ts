// @vitest-environment node
/** 상태 API는 세션·지정 승인자·현재 DB 역할을 모두 검사하며 미설치 지표를 0으로 반환하지 않습니다. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
import { GET } from "@/app/api/academics/health/route";
const actor = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const metrics = { unfinishedCount: "4", expiredCount: "2", verifiedUnsubmittedCount: "1",
  cleanupClaimedCount: "1", cleanupPendingCount: "1", deletedCount: "3" };
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", actor);
  mocks.auth.mockResolvedValue({ user: { id: actor, role: "FACULTY" } });
  mocks.execute.mockResolvedValueOnce({ rows: [{ authorized: true, ready: true }] })
    .mockResolvedValue({ rows: [metrics] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("승인자 전용 학사 상태 조회", () => {
  it.each([null, { user: { id: other, role: "ADMIN" } }, { user: { id: actor, role: "PENDING" } }])(
    "세션 권한이 없는 요청은 SQL 호출 없이 403이며 설정 계정을 actor로 남기지 않습니다", async session => {
      mocks.auth.mockResolvedValue(session);
      const response = await GET();
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(mocks.execute).not.toHaveBeenCalled();
      expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(actor);
      expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ context: expect.objectContaining({ actorUserId: null }) }));
    });
  it("공개 비활성 상태에서는 승인자도 고정 준비 응답만 받습니다", async () => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty("metrics");
  });
  it("후속 업로드 원장이 없으면 SQL 집계 없이 503이며 가짜 0건이 없습니다", async () => {
    mocks.execute.mockReset().mockResolvedValue({ rows: [{ authorized: true, ready: false }] });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(await response.json()).not.toHaveProperty("metrics");
  });
  it.each(["probe", "metrics"])("실제 DB 역할 철회가 %s 시점에 발생해도 지표를 반환하지 않습니다", async phase => {
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [{ authorized: phase !== "probe", ready: true }] })
      .mockResolvedValue({ rows: [] });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).not.toHaveProperty("metrics");
  });
  it("집계 건수만 반환하고 미수집 실패/재시도는 null로 구분합니다", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "PARTIAL", metrics: {
      unfinishedCount: 4, expiredCount: 2, verifiedUnsubmittedCount: 1, cleanupClaimedCount: 1,
      cleanupPendingCount: 1, deletedCount: 3, cleanupFailureCount: null, cleanupRetryCount: null,
    }, cleanupAttemptMetrics: "LOG_ONLY" });
    expect(body.referenceId).toBe(response.headers.get("x-request-id"));
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });
  it.each([null, "", false, true, "  ", undefined])("잘못된 집계 %j는 0건으로 바꾸지 않고 503을 반환합니다", async value => {
    mocks.execute.mockReset().mockResolvedValueOnce({ rows: [{ authorized: true, ready: true }] })
      .mockResolvedValue({ rows: [{ ...metrics, unfinishedCount: value }] });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).not.toHaveProperty("metrics");
  });
  it("원본 SQL 오류·PII·URL은 응답/서버 로그에 남기지 않습니다", async () => {
    const secret = "fixture@example.invalid https://private.invalid/합성.pdf?token=secret";
    mocks.execute.mockReset().mockRejectedValue(new Error(`SELECT private_fn() params:${secret}`));
    const response = await GET();
    expect(response.status).toBe(503);
    const output = JSON.stringify([await response.json(), vi.mocked(console.error).mock.calls]);
    for (const value of [secret, "SELECT", "params:", "private_fn"]) expect(output).not.toContain(value);
  });
});
