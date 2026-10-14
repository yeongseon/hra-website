/**
 * #110 한글로만 된 같은 파일명을 반복 업로드해도 서로 다른 Blob 주소가 저장되는지 확인합니다.
 * 파일 경로를 정규화한 뒤 SDK에 무작위 접미사를 요청하는 실제 서버 액션 경로를 검증합니다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  values: vi.fn(),
  recordOwnedBlob: vi.fn(),
}));

vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn(async () => ({ user: { id: "admin" } })) }));
vi.mock("@/lib/db", () => ({ db: { insert: vi.fn(() => ({ values: mocks.values })) } }));
vi.mock("@/lib/owned-blob", () => ({ recordOwnedBlob: mocks.recordOwnedBlob }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createGuidebook } from "@/features/guidebooks/actions";

describe("가이드북 중복 파일명 업로드", () => {
  beforeEach(() => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-only-token");
    mocks.put.mockReset();
    mocks.values.mockReset().mockResolvedValue(undefined);
    mocks.recordOwnedBlob.mockReset().mockResolvedValue(undefined);
    mocks.put
      .mockResolvedValueOnce({ url: "https://blob.example/guidebook-first.pdf" })
      .mockResolvedValueOnce({ url: "https://blob.example/guidebook-second.pdf" });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("같은 한글 PDF 이름 두 번 모두 저장하고 무작위 접미사를 요청한다", async () => {
    for (let index = 0; index < 2; index += 1) {
      const formData = new FormData();
      formData.set("title", `가이드북 ${index + 1}`);
      formData.set("file", new File(["%PDF-1.4\n"], "가이드북.pdf", { type: "application/pdf" }));
      expect(await createGuidebook(formData)).toEqual({ success: true });
    }

    expect(mocks.put).toHaveBeenCalledTimes(2);
    for (const call of mocks.put.mock.calls) {
      expect(call[0]).toBe("guidebooks/guidebook.pdf");
      expect(call[2]).toMatchObject({ access: "public", addRandomSuffix: true });
    }
    expect(mocks.values).toHaveBeenNthCalledWith(1, expect.objectContaining({
      fileName: "가이드북.pdf",
      fileUrl: "https://blob.example/guidebook-first.pdf",
    }));
    expect(mocks.values).toHaveBeenNthCalledWith(2, expect.objectContaining({
      fileName: "가이드북.pdf",
      fileUrl: "https://blob.example/guidebook-second.pdf",
    }));
  });
});
