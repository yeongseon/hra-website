/** #102 클라이언트가 보낸 완료 URL을 Blob 실물·경로·소유자와 비교합니다. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ head: vi.fn(), insertValues: vi.fn(), findFirst: vi.fn(), fetch: vi.fn() }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@/lib/db", () => ({ db: {
  insert: () => ({ values: mocks.insertValues }),
  query: { markdownImageAssets: { findFirst: mocks.findFirst } },
} }));

import { projectBlobHost } from "@/lib/blob-host";
import { resourceUploadPath } from "@/lib/resource-upload-contract";
import { validateResourceUploadReference } from "@/lib/resource-upload-server";

const userId = "11111111-1111-4111-8111-111111111111";
const uploadId = "22222222-2222-4222-8222-222222222222";
const fileName = "강의자료.pdf";
const pathname = resourceUploadPath("class-materials", userId, uploadId, fileName);
const url = `https://${projectBlobHost}/${pathname}`;

describe("직접 업로드 완료 검증", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.head.mockResolvedValue({ url, pathname, size: 50 * 1024 * 1024, contentType: "application/pdf" });
    mocks.insertValues.mockReturnValue({ onConflictDoNothing: vi.fn().mockResolvedValue(undefined) });
    mocks.findFirst.mockResolvedValue({ uploadedById: userId, deletedAt: null });
    mocks.fetch.mockResolvedValue(new Response("%PDF-1.7\n", { status: 206 }));
    vi.stubGlobal("fetch", mocks.fetch);
  });

  it("정확히 50MB의 본인 PDF를 허용하고 원장에 남긴다", async () => {
    expect(await validateResourceUploadReference("class-materials", userId, url, fileName)).toEqual({ url, fileName });
    expect(mocks.fetch).toHaveBeenCalledWith(url, expect.objectContaining({ redirect: "error" }));
    expect(mocks.insertValues).toHaveBeenCalledWith({ url, uploadedById: userId });
  });

  it("주차별 텍스트는 30MB까지 허용하고 30MB 초과는 거부한다", async () => {
    const weeklyPath = resourceUploadPath("weekly-texts", userId, uploadId, fileName);
    const weeklyUrl = `https://${projectBlobHost}/${weeklyPath}`;
    mocks.head.mockResolvedValue({ url: weeklyUrl, pathname: weeklyPath, size: 30 * 1024 * 1024, contentType: "application/pdf" });
    expect(await validateResourceUploadReference("weekly-texts", userId, weeklyUrl, fileName)).toEqual({ url: weeklyUrl, fileName });
    mocks.head.mockResolvedValue({ url: weeklyUrl, pathname: weeklyPath, size: 30 * 1024 * 1024 + 1, contentType: "application/pdf" });
    expect("error" in await validateResourceUploadReference("weekly-texts", userId, weeklyUrl, fileName)).toBe(true);
  });

  it("위조 URL·다른 사용자 경로·초과 크기·MIME 불일치·잘못된 시작 바이트를 거부한다", async () => {
    expect("error" in await validateResourceUploadReference("class-materials", userId, "https://evil.example/file.pdf", fileName)).toBe(true);
    expect("error" in await validateResourceUploadReference("class-materials", uploadId, url, fileName)).toBe(true);
    mocks.head.mockResolvedValueOnce({ url, pathname, size: 50 * 1024 * 1024 + 1, contentType: "application/pdf" });
    expect("error" in await validateResourceUploadReference("class-materials", userId, url, fileName)).toBe(true);
    mocks.head.mockResolvedValueOnce({ url, pathname, size: 100, contentType: "image/png" });
    expect("error" in await validateResourceUploadReference("class-materials", userId, url, fileName)).toBe(true);
    mocks.fetch.mockResolvedValueOnce(new Response("not a PDF", { status: 206 }));
    expect("error" in await validateResourceUploadReference("class-materials", userId, url, fileName)).toBe(true);
    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it("원장의 소유자가 다른 경우 URL 재사용을 거부한다", async () => {
    mocks.findFirst.mockResolvedValue({ uploadedById: uploadId, deletedAt: null });
    expect("error" in await validateResourceUploadReference("class-materials", userId, url, fileName)).toBe(true);
  });
});
