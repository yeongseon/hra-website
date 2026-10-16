// @vitest-environment node
/** 고정 학사 이벤트가 SQL·개인정보·토큰·임의 키와 getter를 로그에 전달하지 않는지 검증합니다. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
vi.mock("server-only", () => ({}));
import { academicSqlState, createAcademicObservation } from "@/lib/academic-observability";
const actor = "10000000-0000-4000-8000-000000000001";
const request = "20000000-0000-4000-8000-000000000001";
beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("학사 안전 관측 계약", () => {
  it("서버 UUID는 매 요청 새로 만들고 인증 전 거부 actor는 null입니다", () => {
    const first = createAcademicObservation("ASSIGNMENT_CREATE", "ASSIGNMENT");
    const next = createAcademicObservation("ASSIGNMENT_CREATE", "ASSIGNMENT");
    expect(first.correlationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.correlationId).not.toBe(next.correlationId);
    first.emit("DENIED", { failureCode: "AUTHORIZATION" });
    expect(console.error).toHaveBeenCalledWith("[academic/events]", expect.objectContaining({ context:
      expect.objectContaining({ actorUserId: null, correlationId: first.correlationId, outcome: "DENIED" }) }));
    first.authenticated(actor);
    first.identify({ requestId: request });
    first.emit("AUTHORIZED");
    first.emit("REPLAYED");
    expect(console.info).toHaveBeenLastCalledWith("[academic/events]", expect.objectContaining({
      actorUserId: actor, requestId: request, correlationId: first.correlationId, outcome: "REPLAYED",
    }));
  });
  it("중첩 파일 검증은 서버 참조만 공유하고 actor와 실패 상태를 상속하지 않습니다",()=>{
    const parent=createAcademicObservation("SUBMISSION_FINALIZE","SUBMISSION");
    parent.authenticated(actor);
    const child=parent.fork("UPLOAD_VERIFY","UPLOAD_INTENT");
    expect(child.correlationId).toBe(parent.correlationId);
    expect(child.authenticatedActorId).toBeNull();
    child.emit("FAILED",{failureCode:"STORAGE"});
    expect(child.failureRecorded).toBe(true);
    expect(parent.failureRecorded).toBe(false);
  });

  it("실제 Drizzle SQL·params·cause에서 고정 SQLSTATE만 선택합니다", () => {
    const secret = "합성비공개이름 fixture@example.invalid";
    const error = new DrizzleQueryError("SELECT private_function($1)", [secret],
      Object.assign(new Error(secret), { code: "23505", detail: secret }));
    expect(academicSqlState(error)).toBe("23505");
    const observation = createAcademicObservation("ENROLLMENT_LINK", "ENROLLMENT_BATCH");
    observation.emit("FAILED", { sqlState: academicSqlState(error), failureCode: "STORAGE" });
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    for (const text of [secret, "SELECT", "private_function", "params", "cause"]) expect(output).not.toContain(text);
    expect(output).toContain("23505");
    expect(academicSqlState({ code: "EMAIL" })).toBeUndefined();
  });

  it("런타임 임의 필드·잘못된 ID·URL·토큰과 직렬화 코드를 버립니다", () => {
    const secret = "https://private.invalid/합성이름.pdf?token=secret";
    const getter = vi.fn(() => { throw new Error(secret); });
    const details = { resourceId: secret, requestId: secret, sqlState: secret, retryCount: secret,
      email: secret, body: secret, token: secret, cause: secret, toJSON: getter };
    Object.defineProperty(details, "failureCode", { get: getter });
    const observation = createAcademicObservation("FILE_READ", "SUBMISSION_FILE");
    observation.authenticated(secret);
    observation.emit("STREAM_INTERRUPTED", details);
    expect(getter).not.toHaveBeenCalled();
    const output = JSON.stringify(vi.mocked(console.error).mock.calls);
    for (const text of [secret, "token", "email", "body", "cause", "toJSON"]) expect(output).not.toContain(text);
    expect(console.error).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ context: expect.objectContaining({
      actorUserId: null, resourceId: null, requestId: null, sqlState: null, retryCount: null,
    }) }));
  });

  it("예외 속성 getter를 읽지 않고 로그 장애가 완료 결과를 뒤집지 않습니다", () => {
    const getter = vi.fn(() => { throw new Error("민감자료"); });
    const error = Object.defineProperty({}, "cause", { get: getter });
    expect(academicSqlState(error)).toBeUndefined();
    expect(getter).not.toHaveBeenCalled();
    vi.mocked(console.info).mockImplementation(() => { throw new Error("로그 장애"); });
    const observation = createAcademicObservation("STUDENT_REGISTER", "STUDENT");
    expect(observation.emit("COMPLETED")).toBe(false);
  });
});
