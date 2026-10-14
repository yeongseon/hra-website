// @vitest-environment node
/** 일일 요청 제한 로그 정리 경로의 인증 및 네 테이블 삭제를 검증합니다 (#121). */
import { NextRequest } from "next/server";
import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  batch: vi.fn(),
  logServerError: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    delete: (table: unknown) => ({ where: (condition: unknown) => ({ table, condition }) }),
    batch: mocks.batch,
  },
}));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));

import { GET } from "@/app/api/cron/cleanup-rate-limits/route";

function request(secret?: string) {
  return new NextRequest("http://localhost/api/cron/cleanup-rate-limits", {
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });
}

describe("요청 제한 로그 일일 정리", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("CRON_SECRET", "test-secret");
    mocks.batch.mockResolvedValue([]);
  });
  afterEach(() => vi.unstubAllEnvs());

  it("비인증 요청을 차단하며 삭제 쿼리를 실행하지 않는다", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("wrong"))).status).toBe(401);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("설정이 없으면 정리 작업을 실행하지 않는다", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(request())).status).toBe(503);
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("인증된 작업은 신규·과거 로그 네 테이블을 한 배치로 정리한다", async () => {
    const response = await GET(request("test-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    const queries = mocks.batch.mock.calls[0][0] as { table: Parameters<typeof getTableName>[0]; condition: Parameters<PgDialect["sqlToQuery"]>[0] }[];
    expect(queries.map((query) => getTableName(query.table))).toEqual([
      "rate_limit_events",
      "login_attempts",
      "upload_rate_limit_log",
      "application_submissions_log",
    ]);
    for (const query of queries) {
      const cutoff = new PgDialect().sqlToQuery(query.condition).params[0];
      expect(typeof cutoff).toBe("string");
      const age = Date.now() - Date.parse(String(cutoff));
      expect(age).toBeGreaterThanOrEqual(48 * 60 * 60 * 1000);
      expect(age).toBeLessThan(48 * 60 * 60 * 1000 + 5000);
    }
  });

  it("DB 오류를 성공으로 처리하지 않는다", async () => {
    mocks.batch.mockRejectedValueOnce(new Error("DB unavailable"));
    const response = await GET(request("test-secret"));
    expect(response.status).toBe(500);
    expect(mocks.logServerError).toHaveBeenCalledTimes(1);
  });
});
