// @vitest-environment node
/**
 * 본문 이미지 업로드의 소유권 기록과 실패 시 새 파일 보상 삭제를 검증합니다 (#88).
 * 운영 Blob/DB에는 접근하지 않고 요청·응답 경계를 실행합니다.
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  put: vi.fn(),
  values: vi.fn(),
  deleteBlobIfExists: vi.fn(),
  logServerError: vi.fn(),
  reserveUploadAttempt: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob", () => ({ put: mocks.put }));
vi.mock("@/lib/blob-utils", () => ({ deleteBlobIfExists: mocks.deleteBlobIfExists }));
vi.mock("@/lib/db", () => ({ db: { insert: () => ({ values: mocks.values }) } }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("@/lib/rate-limit", () => ({
  reserveUploadAttempt: mocks.reserveUploadAttempt,
}));
vi.mock("@/lib/rate-limit-core", () => ({ extractClientIp: () => "127.0.0.1" }));

import { POST } from "@/app/api/upload-image/route";

const blobUrl = "https://example.public.blob.vercel-storage.com/markdown-images/new.png";
const userId = "11111111-1111-4111-8111-111111111111";

function uploadRequest() {
  const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const formData = new FormData();
  formData.set("file", new File([pngHeader], "new.png", { type: "image/png" }));
  return new NextRequest("http://localhost/api/upload-image", {
    method: "POST",
    body: formData,
  });
}

describe("본문 이미지 업로드 소유권", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.put.mockResolvedValue({ url: blobUrl });
    mocks.values.mockResolvedValue(undefined);
    mocks.reserveUploadAttempt.mockResolvedValue({ blocked: false, retryAfterSec: 0, reservationId: "test" });
    mocks.deleteBlobIfExists.mockResolvedValue(undefined);
  });

  it("소유권을 기록한 뒤에만 URL을 응답한다", async () => {
    const response = await POST(uploadRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ url: blobUrl });
    expect(mocks.values).toHaveBeenCalledWith({ url: blobUrl, uploadedById: userId });
    expect(mocks.deleteBlobIfExists).not.toHaveBeenCalled();
  });

  it("소유권 기록 실패 시 새 파일을 지우고 URL을 응답하지 않는다", async () => {
    mocks.values.mockRejectedValueOnce(new Error("DB 실패"));

    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "이미지 업로드 중 오류가 발생했습니다." });
    expect(mocks.deleteBlobIfExists).toHaveBeenCalledExactlyOnceWith(blobUrl);
  });
});
