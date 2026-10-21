/** 수료생 사진 직접 업로드의 크기·역할·경로·실물 검증을 확인합니다 (#102). */
import { syntheticPng } from "../support/synthetic-image";
import { directUploadOriginCases } from "../support/direct-upload-origin-cases";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), handleUpload: vi.fn(), upload: vi.fn(), head: vi.fn(), recordUpload: vi.fn(), fetch: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mocks.handleUpload, upload: mocks.upload }));
vi.mock("@vercel/blob", () => ({ head: mocks.head }));
vi.mock("@/lib/resource-upload-server", () => ({ recordResourceUpload: mocks.recordUpload }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import { POST } from "@/app/api/alumni-uploads/route";
import { alumniUploadPath, maxAlumniImageBytes } from "@/lib/alumni-upload-contract";
import { prepareAlumniUploads } from "@/lib/alumni-upload-client";
import { validateAlumniImageReference } from "@/lib/alumni-upload-server";
import { projectBlobHost } from "@/lib/blob-host";

const storyId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const uploadId = "33333333-3333-4333-8333-333333333333";
const pathname = alumniUploadPath(storyId, userId, uploadId, "png");
const url = `https://${projectBlobHost}/${pathname}`;
const input = { storyId, uploadId, fileName: "사진.png", size: maxAlumniImageBytes, contentType: "image/png" };

async function issueToken(payload = input, path = pathname, request?: Request) {
  mocks.handleUpload.mockImplementation(async (options: { onBeforeGenerateToken: (path: string, payload: string) => Promise<unknown> }) =>
    options.onBeforeGenerateToken(path, JSON.stringify(payload)));
  return POST(request ?? new Request("https://hra.example/api/alumni-uploads", {
    method: "POST", headers: { origin: "https://hra.example" }, body: JSON.stringify({ type: "blob.generate-client-token" }),
  }));
}

describe("수료생 사진 직접 업로드", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "ADMIN" } });
    mocks.head.mockResolvedValue({ url, pathname, size: maxAlumniImageBytes, contentType: "image/png" });
    mocks.fetch.mockResolvedValue(new Response(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a), { status: 206 }));
    vi.stubGlobal("fetch", mocks.fetch);
  });

  directUploadOriginCases({
    route: "/api/alumni-uploads",
    issue: request => issueToken(input, pathname, request),
    recordCount: () => mocks.recordUpload.mock.calls.length,
  });

  it("5MB 경계와 관리자 권한을 허용하고 초과·타 경로·GIF를 거부한다", async () => {
    const response = await issueToken();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ maximumSizeInBytes: maxAlumniImageBytes, allowedContentTypes: ["image/png"] });
    expect((await issueToken({ ...input, size: maxAlumniImageBytes + 1 })).status).toBe(400);
    expect((await issueToken(input, alumniUploadPath(uploadId, userId, uploadId, "png"))).status).toBe(400);
    expect((await issueToken({ ...input, fileName: "사진.gif", contentType: "image/gif" })).status).toBe(400);
    mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
    expect((await issueToken()).status).toBe(400);
  });

  it("브라우저가 직접 보내고 서버 액션에는 URL만 전달한다", async () => {
    mocks.upload.mockResolvedValue({ url });
    const formData = new FormData();
    formData.set("images", new File([syntheticPng()], "사진.png", { type: "image/png" }));
    const result = await prepareAlumniUploads(formData, storyId, userId);
    expect("formData" in result).toBe(true);
    expect(formData.getAll("images")).toHaveLength(0);
    expect(formData.get("uploadedImageUrls")).toBe(JSON.stringify([url]));
    expect(mocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^alumni-uploads\//), expect.any(File),
      expect.objectContaining({ handleUploadUrl: "/api/alumni-uploads" }));
  });

  it("완료 콜백은 외부 URL과 경로 위조를 거부한다", async () => {
    const payload = JSON.stringify({ ...input, userId, pathname });
    const complete = async (blobUrl: string, blobPath = pathname) => {
      mocks.handleUpload.mockImplementation(async (options: {
        onUploadCompleted: (event: { blob: { url: string; pathname: string }; tokenPayload: string }) => Promise<void>;
      }) => {
        await options.onUploadCompleted({ blob: { url: blobUrl, pathname: blobPath }, tokenPayload: payload });
        return { type: "blob.upload-completed" };
      });
      return POST(new Request("https://hra.example/api/alumni-uploads", { method: "POST", body: JSON.stringify({ type: "blob.upload-completed" }) }));
    };
    expect((await complete("https://evil.example/photo.png")).status).toBe(400);
    expect((await complete(url, "alumni-uploads/other.png")).status).toBe(400);
    expect((await complete(url)).status).toBe(200);
  });

  it("저장 전 URL·소유자·크기·실제 바이트를 검증한다", async () => {
    expect(await validateAlumniImageReference(storyId, userId, url)).toBe(true);
    expect(await validateAlumniImageReference(storyId, userId, "https://evil.example/photo.png")).toBe(false);
    expect(await validateAlumniImageReference(storyId, uploadId, url)).toBe(false);
    mocks.head.mockResolvedValueOnce({ url, pathname, size: maxAlumniImageBytes + 1, contentType: "image/png" });
    expect(await validateAlumniImageReference(storyId, userId, url)).toBe(false);
    mocks.fetch.mockResolvedValueOnce(new Response("not an image", { status: 206 }));
    expect(await validateAlumniImageReference(storyId, userId, url)).toBe(false);
  });
});
