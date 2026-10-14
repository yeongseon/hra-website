/** 생성 실패 후 Blob 삭제도 실패할 때 사용자 요청을 더 망가뜨리지 않고 로그를 남기는지 검증합니다. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  del: vi.fn(),
  logServerError: vi.fn(),
  redactBlobUrl: vi.fn((url: string) => new URL(url).hostname),
}));

vi.mock("@vercel/blob", () => ({ del: mocks.del }));
vi.mock("@/lib/errors", () => ({
  logServerError: mocks.logServerError,
  redactBlobUrl: mocks.redactBlobUrl,
}));

import { deleteBlobIfExists } from "@/lib/blob-utils";

describe("Blob 정리 실패", () => {
  beforeEach(() => vi.resetAllMocks());

  it("삭제 오류를 기록하고 호출자에게 새 오류를 던지지 않는다", async () => {
    const url = "https://example.public.blob.vercel-storage.com/class-logs/new.png";
    mocks.del.mockRejectedValueOnce(new Error("삭제 실패"));
    mocks.redactBlobUrl.mockReturnValueOnce("example.public.blob.vercel-storage.com");

    await expect(deleteBlobIfExists(url)).resolves.toBeUndefined();
    expect(mocks.logServerError).toHaveBeenCalledExactlyOnceWith(
      "blob-utils/delete",
      expect.any(Error),
      { blobUrl: "example.public.blob.vercel-storage.com" },
    );
  });
});
