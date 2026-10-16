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

  it("구형 서버 경유 API는 4MB 초과 요청을 Blob에 보내지 않는다", async () => {
    const formData = new FormData();
    formData.set("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.png", { type: "image/png" }));
    const response = await POST(new NextRequest("http://localhost/api/upload-image", { method: "POST", body: formData }));
    expect(response.status).toBe(400);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it.each([
    ["JSON 본문", "application/json", "{}"],
    ["손상된 multipart", "multipart/form-data; boundary=missing", "not-multipart"],
    ["경계가 없는 multipart", "multipart/form-data", "not-multipart"],
  ])("%s은 서버 오류 대신 입력 오류로 거부한다", async (_label, contentType, body) => {
    const response = await POST(new NextRequest("http://localhost/api/upload-image", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "올바른 파일 업로드 요청이 아닙니다." });
    expect(mocks.reserveUploadAttempt).toHaveBeenCalledOnce();
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.values).not.toHaveBeenCalled();
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it.each([
    ["익명", null, 401],
    ["승인 대기", { user: { id: userId, role: "PENDING" } }, 403],
  ])("%s 요청은 잘못된 본문을 읽기 전에 거부한다", async (_label, session, status) => {
    mocks.auth.mockResolvedValueOnce(session);
    const request = new NextRequest("http://localhost/api/upload-image", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const parseBody = vi.spyOn(request, "formData");

    expect((await POST(request)).status).toBe(status);
    expect(parseBody).not.toHaveBeenCalled();
    expect(mocks.reserveUploadAttempt).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("요청 제한에 걸리면 잘못된 본문도 읽지 않고 재시도 시간을 안내한다", async () => {
    mocks.reserveUploadAttempt.mockResolvedValueOnce({ blocked: true, retryAfterSec: 37 });
    const request = new NextRequest("http://localhost/api/upload-image", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
    });
    const parseBody = vi.spyOn(request, "formData");
    const response = await POST(request);

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("37");
    expect(parseBody).not.toHaveBeenCalled();
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("본문을 읽기 전 DB 예약 실패는 기존 서버 오류로 처리한다", async () => {
    mocks.reserveUploadAttempt.mockRejectedValueOnce(new Error("합성 DB 오류"));
    const response = await POST(uploadRequest());

    expect(response.status).toBe(500);
    expect(mocks.logServerError).toHaveBeenCalledOnce();
    expect(mocks.put).not.toHaveBeenCalled();
  });
});
