/**
 * 새 업로드의 소유권 기록 실패 시 콘텐츠 DB 작업으로 진행하지 않도록 검증합니다 (#93).
 * 이미 다른 곳에 저장된 URL은 테스트의 삭제 대상으로 삼지 않습니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  insertValues: vi.fn(),
  deleteBlobIfExists: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { insert: () => ({ values: mocks.insertValues }) },
}));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));

import { recordOwnedBlob } from "@/lib/owned-blob";

const url = "https://example.public.blob.vercel-storage.com/gallery/new.png";
const userId = "11111111-1111-4111-8111-111111111111";

describe("새 Blob 소유권 기록", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.deleteBlobIfExists.mockResolvedValue(undefined);
  });

  it("원장 기록이 성공하면 새 파일을 유지한다", async () => {
    await recordOwnedBlob(url, userId);

    expect(mocks.insertValues).toHaveBeenCalledWith({ url, uploadedById: userId });
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("원장 기록이 실패하면 콘텐츠 저장 전에 새 파일만 되지우고 실패를 전달한다", async () => {
    mocks.insertValues.mockRejectedValueOnce(new Error("원장 쓰기 실패"));

    await expect(recordOwnedBlob(url, userId)).rejects.toThrow("원장 쓰기 실패");
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledExactlyOnceWith(url);
  });
});
