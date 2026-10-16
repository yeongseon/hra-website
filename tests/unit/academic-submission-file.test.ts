// @vitest-environment node
/**
 * 개인 파일의 실제 요청 경계·응답·저장소 입력과 실패 로그를 검증합니다.
 * 객체 소유권 SQL과 감사 원자성은 별도 실제 PostgreSQL 테스트에서 확인합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { PgDialect } from "drizzle-orm/pg-core";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));
import { GET } from "@/app/api/academic/submissions/[id]/file/[fileId]/route";

const userId = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000001";
const fileId = "30000000-0000-4000-8000-000000000001";
const intentId = "40000000-0000-4000-8000-000000000001";
const key = `academic-uploads/v1/${intentId}/document.pdf`;
const bytes = new TextEncoder().encode("PDF");
const stored = { storage_key: key, original_name: "한글 과제.pdf", mime_type: "application/pdf",
  size_bytes: bytes.length, checksum: "a".repeat(64), access_id: "50000000-0000-4000-8000-000000000001" };
const request = new Request("http://localhost/api/academic/submissions/ignored/file/ignored?url=https://attacker.invalid/private.pdf");
const context = () => ({ params: Promise.resolve({ id, fileId }) });
const blob = () => ({ statusCode: 200, blob: { size: bytes.length, contentType: "application/pdf",
  url: `https://submissionqa.private.blob.vercel-storage.com/${key}`, pathname: key },
  stream: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", "");
  vi.stubEnv("ACADEMIC_SUBMISSION_BLOB_HOST", "submissionqa.private.blob.vercel-storage.com");
  vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", "qa-only-sensitive-token");
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.execute.mockResolvedValue({ rows: [stored] });
  mocks.get.mockImplementation(async () => blob());
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("개인 제출 파일 HTTP 경계", () => {
  it("인증 전에 params·학사 DB·Blob을 읽지 않는다", async () => {
    mocks.auth.mockResolvedValue(null);
    const params = Promise.resolve({ get id(): string { throw new Error("인증 전 params 접근"); }, fileId });
    const response = await GET(request, { params });
    expect(response.status).toBe(401);
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it.each(["ADMIN", "FACULTY", "PENDING", "UNKNOWN"])("미지정 %s 역할은 DB 조회 전에 403", async (role) => {
    mocks.auth.mockResolvedValue({ user: { id: userId, role } });
    expect((await GET(request, context())).status).toBe(403);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it.each(["MEMBER", "FACULTY", "ADMIN"])("정확히 지정한 %s 승인자는 명시 관리 범위를 사용한다", async (role) => {
    vi.stubEnv("ACADEMIC_APPROVER_USER_ID", userId);
    mocks.auth.mockResolvedValue({ user: { id: userId, role } });
    const response = await GET(request, context());
    expect(response.status).toBe(200);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0][0]);
    expect(query.params).toContain("MANAGEMENT");
    expect(query.params).toContain(userId);
    await response.body?.cancel();
  });

  it.each([undefined, "false", "", "TRUE"])("전체 gate %s는 신규 학사 표에 접근하지 않는다", async (enabled) => {
    if (enabled === undefined) delete process.env.ACADEMIC_ENABLED;
    else vi.stubEnv("ACADEMIC_ENABLED", enabled);
    expect((await GET(request, context())).status).toBe(404);
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("잘못된 UUID·없는 파일·타인 파일은 같은 404 본문과 헤더를 반환한다", async () => {
    mocks.execute.mockResolvedValue({ rows: [] });
    const invalid = await GET(request, { params: Promise.resolve({ id: "bad", fileId }) });
    const absent = await GET(request, context());
    const denied = await GET(request, context());
    expect([invalid.status, absent.status, denied.status]).toEqual([404, 404, 404]);
    const texts = await Promise.all([invalid.text(), absent.text(), denied.text()]);
    expect(new Set(texts).size).toBe(1);
    expect(absent.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("감사가 확정된 DB 키만 읽고 한글 파일명을 인코딩하며 보수적인 첨부 응답을 제공한다", async () => {
    const response = await GET(request, context());
    expect(mocks.execute.mock.invocationCallOrder[0]).toBeLessThan(mocks.get.mock.invocationCallOrder[0]);
    expect(mocks.get).toHaveBeenCalledExactlyOnceWith(key, {
      access: "private", token: "qa-only-sensitive-token", storeId: "submissionqa", useCache: false,
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("PDF");
    expect(response.headers.get("content-type")).toBe("application/octet-stream");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''%ED%95%9C%EA%B8%80%20%EA%B3%BC%EC%A0%9C.pdf");
    expect(response.headers.get("content-disposition")).toMatch(/^attachment;/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-length")).toBe(String(bytes.length));
  });

  it.each(["https://attacker.invalid/file.pdf", "academic-uploads/v1/../document.pdf", "resources/test.pdf"])("예상 밖 DB 경로도 거부한다: %s", async (storage_key) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.execute.mockResolvedValue({ rows: [{ ...stored, storage_key }] });
    expect((await GET(request, context())).status).toBe(503);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("개인 제출 저장소 설정이 없으면 공유 자료 토큰으로 대체하지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", "");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "must-not-be-used");
    expect((await GET(request, context())).status).toBe(503);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("Blob 크기·형식 불일치 및 원본 제거는 파일을 전달하지 않는다", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (const result of [null, { ...blob(), blob: { ...blob().blob, size: bytes.length + 1 } },
      { ...blob(), blob: { ...blob().blob, contentType: "text/html" } }]) {
      mocks.get.mockResolvedValueOnce(result);
      expect((await GET(request, context())).status).toBe(503);
    }
  });

  it.each([
    { url: `http://submissionqa.private.blob.vercel-storage.com/${key}`, pathname: key },
    { url: `https://otherstore.private.blob.vercel-storage.com/${key}`, pathname: key },
    { url: `https://submissionqa.private.blob.vercel-storage.com/${key}`, pathname: "other.pdf" },
    { url: `https://submissionqa.private.blob.vercel-storage.com/other.pdf`, pathname: key },
    { url: `https://submissionqa.private.blob.vercel-storage.com/${key}?token=unexpected`, pathname: key },
    { url: `https://user@submissionqa.private.blob.vercel-storage.com/${key}`, pathname: key },
    { url: `https://submissionqa.private.blob.vercel-storage.com/${key}#fragment`, pathname: key },
    { url: `https://submissionqa.private.blob.vercel-storage.com:8443/${key}`, pathname: key },
    { url: `https://submissionqa.private.blob.vercel-storage.com:443/${key}`, pathname: key },
  ])("SDK 토큰 저장소·반환 경로가 설정과 다르면 취소하고 503", async (metadata) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cancel = vi.fn();
    mocks.get.mockResolvedValue({ ...blob(), blob: { ...blob().blob, ...metadata }, stream: new ReadableStream({ cancel }) });
    expect((await GET(request, context())).status).toBe(503);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("감사 DB·Blob 오류의 경로·본문·토큰·SQL params를 실제 실패 로그에 남기지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const secret = "sensitive-student@example.invalid";
    mocks.execute.mockRejectedValueOnce(new DrizzleQueryError("SELECT secret($1)", [secret, key], new Error("개인 본문")));
    expect((await GET(request, context())).status).toBe(503);
    expect(mocks.get).not.toHaveBeenCalled();
    mocks.get.mockRejectedValueOnce(new Error(`Bearer qa-only-sensitive-token https://submissionqa.private.blob.vercel-storage.com/${key} ${secret}`));
    expect((await GET(request, context())).status).toBe(503);
    const output = JSON.stringify(log.mock.calls);
    for (const value of [secret, key, "qa-only-sensitive-token", "개인 본문", "SELECT secret", "params:"]) expect(output).not.toContain(value);
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("응답 시작 후 스트림 실패도 고정 오류로 감싸 경로·토큰이 프레임워크 로그로 전파되지 않는다", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.get.mockResolvedValue({ ...blob(), stream: new ReadableStream({ pull() {
      throw new Error(`private ${key} qa-only-sensitive-token`);
    } }) });
    const response = await GET(request, context());
    expect(response.status).toBe(200);
    await expect(response.text()).rejects.toThrow("파일 전송이 중단되었습니다.");
    expect(JSON.stringify(log.mock.calls)).not.toContain(key);
    expect(JSON.stringify(log.mock.calls)).not.toContain("qa-only-sensitive-token");
  });
});
