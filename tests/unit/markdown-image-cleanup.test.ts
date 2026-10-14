// @vitest-environment node
/**
 * 본문 이미지 정리 명령의 삭제 경계를 검증합니다 (#88).
 * DB 조회와 Blob SDK만 가짜로 대체하고 실제 명령 모듈을 실행합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  neon: vi.fn(),
  query: vi.fn(),
  del: vi.fn(),
}));

vi.mock("@neondatabase/serverless", () => ({ neon: mocks.neon }));
vi.mock("@vercel/blob", () => ({ del: mocks.del, BlobNotFoundError: class BlobNotFoundError extends Error {} }));

const originalArgv = process.argv;
const originalEnv = {
  databaseUrl: process.env.DATABASE_URL,
  blobToken: process.env.BLOB_READ_WRITE_TOKEN,
  writesStopped: process.env.HRA_CONTENT_WRITES_STOPPED,
};
const originalExitCode = process.exitCode;
const url = "https://example.public.blob.vercel-storage.com/markdown-images/owned.png";
const id = "11111111-1111-4111-8111-111111111111";
let runNumber = 0;

async function runCleanup() {
  // 쿼리 문자열은 이 테스트의 관심사가 아닙니다. 실제 PostgreSQL 검증은 별도 테스트가 담당합니다.
  const scriptPath = new URL("../../scripts/cleanup-markdown-image-assets.mjs", import.meta.url).href;
  await import(`${scriptPath}?test=${++runNumber}`);
}

describe("본문 이미지 정리 명령", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.neon.mockReturnValue(mocks.query);
    mocks.del.mockResolvedValue(undefined);
    process.argv = ["node", "cleanup-markdown-image-assets.mjs", "--apply"];
    process.env.DATABASE_URL = "postgresql://test.invalid/test";
    process.env.BLOB_READ_WRITE_TOKEN = "test-token";
    process.env.HRA_CONTENT_WRITES_STOPPED = "1";
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (originalEnv.databaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalEnv.databaseUrl;
    if (originalEnv.blobToken === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = originalEnv.blobToken;
    if (originalEnv.writesStopped === undefined) delete process.env.HRA_CONTENT_WRITES_STOPPED;
    else process.env.HRA_CONTENT_WRITES_STOPPED = originalEnv.writesStopped;
    process.exitCode = originalExitCode;
    vi.restoreAllMocks();
  });

  it("현재 참조가 사라진 소유 파일만 삭제한다", async () => {
    mocks.query
      .mockResolvedValueOnce([{ id, url }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await runCleanup();

    expect(mocks.del).toHaveBeenCalledExactlyOnceWith(url);
    expect(mocks.query).toHaveBeenCalledTimes(3);
  });

  it("점검 후 새 참조가 보이면 파일을 보존한다", async () => {
    mocks.query
      .mockResolvedValueOnce([{ id, url }])
      .mockResolvedValueOnce([{ present: 1 }]);

    await runCleanup();

    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.query).toHaveBeenCalledTimes(2);
  });

  it("Blob 삭제가 실패하면 원장을 삭제 완료로 표시하지 않는다", async () => {
    mocks.query
      .mockResolvedValueOnce([{ id, url }])
      .mockResolvedValueOnce([]);
    mocks.del.mockRejectedValueOnce(new Error("삭제 실패"));

    await runCleanup();

    expect(mocks.query).toHaveBeenCalledTimes(2);
    expect(process.exitCode).toBe(1);
  });

  it("업로드되지 않은 예약 URL도 정리 완료로 표시한다", async () => {
    const { BlobNotFoundError } = await import("@vercel/blob");
    mocks.query
      .mockResolvedValueOnce([{ id, url }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    mocks.del.mockRejectedValueOnce(new BlobNotFoundError());

    await runCleanup();

    expect(mocks.query).toHaveBeenCalledTimes(3);
    expect(process.exitCode).not.toBe(1);
  });
});
