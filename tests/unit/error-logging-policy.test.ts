/**
 * 서버 오류 로그의 허용 필드 정책과 #70 비노출 회귀를 검증한다.
 * 원본 오류·SQL·사용자 문자열은 로그에 남기지 않고 검증된 코드와 식별자만 남긴다.
 */
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { logServerError } from "@/lib/errors";
import { parseMarkdown } from "@/lib/markdown/parse";

// 개인정보 대신 합성 표식만 사용하되 설치 Drizzle의 실제 오류 메시지·cause 구조를 유지한다.
const drizzleQueries = [
  ["따옴표 SELECT", 'SELECT "qa_private_column" FROM "qa_private_rows" WHERE "id" = $1'],
  ["따옴표 DELETE", 'DELETE FROM "qa_private_rows" WHERE "id" = $1'],
  ["개행 CTE", `WITH "qa_private_cte" AS (
    SELECT $1::text AS "qa_private_column"
  )
  SELECT "qa_private_column" FROM "qa_private_cte"`],
];

function drizzleFailure(query: string) {
  const cause = Object.assign(new Error("qa_synthetic_provider_failure"), { code: "P0001" });
  return new DrizzleQueryError(query, ["qa_synthetic_parameter"], cause);
}

describe("logServerError", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it.each(drizzleQueries)("실제 %s 오류를 로그할 때 원문 대신 SQLSTATE만 남긴다", (_label, query) => {
    logServerError("qa/redaction", drizzleFailure(query), { count: 1 });
    expect(consoleErrorSpy).toHaveBeenCalledOnce();
    const serialized = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(serialized).not.toMatch(/qa_private_|qa_synthetic_parameter|qa_synthetic_provider_failure|params:/);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[qa/redaction]", {
      context: { count: 1 },
      error: { kind: "DATABASE", sqlState: "P0001" },
    });
  });

  it("scope 를 대괄호로 감싸 첫 번째 인자로 전달한다", () => {
    logServerError("test/scope", new Error("x"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[test/scope]",
      expect.objectContaining({ error: { kind: "ERROR" } }),
    );
  });

  it("context 가 없으면 payload 에 context 키를 넣지 않는다", () => {
    logServerError("t", new Error("x"));
    const call = consoleErrorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(call).not.toHaveProperty("context");
    expect(call).toHaveProperty("error");
  });

  it("검증된 context 식별자·개수·boolean만 로그한다", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    logServerError("t", new Error("x"), { id, count: 3, active: true });
    const call = consoleErrorSpy.mock.calls[0]?.[1] as { context?: Record<string, unknown> };
    expect(call.context).toEqual({ id, count: 3, active: true });
  });

  it("error message를 로그하지 않는다 (SQL 미포함 확인)", () => {
    logServerError("t", new Error("SELECT * FROM users WHERE id=1"));
    const call = consoleErrorSpy.mock.calls[0]?.[1] as { error: Record<string, unknown> };
    expect(call.error).toEqual({ kind: "ERROR" });
    expect(JSON.stringify(call)).not.toContain("users");
  });
});

describe("logServerError 허용 필드 정책 (#369)", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;
  const requestId = "123e4567-e89b-42d3-a456-426614174000";

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("원본 오류·임의 context 대신 검증된 SQLSTATE·요청 참조·개수만 기록한다", () => {
    const secret = "private@example.invalid";
    const error = Object.assign(new Error(`SELECT * FROM users WHERE email='${secret}'`), {
      name: `Token ${secret}`,
      code: "23505",
      stack: `https://example.invalid/${secret}`,
      cause: { detail: secret },
    });
    logServerError("markdown/parse", error, {
      requestId,
      candidateCount: 3,
      email: secret,
      token: "SECRET_TOKEN",
      url: `https://example.invalid/${secret}`,
      sql: `SELECT '${secret}'`,
    });
    const serialized = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(serialized).not.toMatch(/private@example|SECRET_TOKEN|example\.invalid|SELECT|Token/);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[markdown/parse]", {
      context: { requestId, candidateCount: 3 },
      error: { kind: "DATABASE", sqlState: "23505" },
    });
  });

  it("허용된 키라도 잘못된 UUID·SQLSTATE·개수·enum은 출력하지 않는다", () => {
    logServerError("test/scope", new Error("secret"), {
      requestId: "not-a-uuid",
      candidateCount: Number.POSITIVE_INFINITY,
      retryCount: -1,
      sqlState: "TOKEN",
      action: "SECRET_TOKEN",
      issueFields: "email.secret",
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[test/scope]", {
      error: { kind: "ERROR" },
    });
  });

  it("정상 학사 상관관계·결과 enum과 검증된 원인 코드만 유지한다", () => {
    const error = Object.assign(new Error("raw secret"), { cause: { code: "23503" } });
    logServerError("academic/events", error, {
      correlationId: requestId,
      actorUserId: null,
      action: "ASSIGNMENT_CREATE",
      outcome: "FAILED",
      failureCode: "STORAGE",
      sqlState: "23503",
      retryCount: 2,
    });
    expect(consoleErrorSpy).toHaveBeenCalledWith("[academic/events]", {
      context: {
        correlationId: requestId,
        actorUserId: null,
        action: "ASSIGNMENT_CREATE",
        outcome: "FAILED",
        failureCode: "STORAGE",
        sqlState: "23503",
        retryCount: 2,
      },
      error: { kind: "DATABASE", sqlState: "23503" },
    });
  });

  it("병리적 getter·Proxy·순환 cause에서도 원문을 읽거나 예외를 던지지 않는다", () => {
    const error = new Error("private@example.invalid");
    Object.defineProperty(error, "code", { get() { throw new Error("SECRET_TOKEN"); } });
    Object.defineProperty(error, "cause", { value: error });
    const context = new Proxy({ requestId }, {
      getOwnPropertyDescriptor() { throw new Error("SECRET_TOKEN"); },
    });
    expect(() => logServerError("invalid scope private@example.invalid", error, context)).not.toThrow();
    const serialized = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(serialized).not.toMatch(/private@example|SECRET_TOKEN/);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[invalid-scope]", { error: { kind: "ERROR" } });
  });
});

describe("logServerError + Blob URL 비노출 통합 (#369)", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("Blob URL 문자열을 context에 전달해도 로그에서는 제외한다", () => {
    const url = "https://xyz.public.blob.vercel-storage.com/alumni/1234-홍길동.jpg";
    logServerError("blob-utils/delete", new Error("blob delete failed"), {
      blobUrl: url,
    });
    const call = consoleErrorSpy.mock.calls[0]?.[1] as { context?: { blobUrl?: string } };
    expect(call.context).toBeUndefined();
    const serialized = JSON.stringify(consoleErrorSpy.mock.calls);
    expect(serialized).not.toContain("홍길동");
    expect(serialized).not.toContain("blob.vercel-storage.com");
  });
});

describe("Markdown 파서 오류의 실제 로그 경계 (#369)", () => {
  let consoleErrorSpy: MockInstance<typeof console.error>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("YAML 오류 객체의 버퍼에 입력 스니펫이 있어도 로그에 남기지 않는다", () => {
    const email = "markdown-private@example.invalid";
    const result = parseMarkdown(`---\ntitle: [${email}\n---\n본문`, "guide");
    expect(result.ok).toBe(false);
    expect(consoleErrorSpy).toHaveBeenCalledWith("[markdown/parse]", {
      context: { kind: "guide" },
      error: { kind: "ERROR" },
    });
    expect(JSON.stringify(consoleErrorSpy.mock.calls)).not.toContain(email);
  });
});
