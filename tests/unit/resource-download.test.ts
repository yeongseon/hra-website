/**
 * 자료실 다운로드 경로의 저장소 제한과 한글 파일명 응답을 검증합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { attachmentDisposition, isProjectBlobUrl } from "@/lib/resource-download";
import { projectBlobHost } from "@/lib/blob-host";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  requireReader: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ get: mocks.get }));
vi.mock("@/lib/resource-access", () => ({ requireSharedResourceReader: mocks.requireReader }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));

import { GET } from "@/app/api/resources/[kind]/[id]/download/route";

const id = "00000000-0000-4000-8000-000000000001";
const blobUrl = `https://${projectBlobHost}/materials/original-123.pdf`;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireReader.mockResolvedValue({ user: { id: "member-1", role: "MEMBER" } });
  mocks.select.mockReturnValue({ from: () => ({ where: () => ({ limit: mocks.limit }) }) });
  mocks.limit.mockResolvedValue([{ fileUrl: blobUrl, fileName: "수업 자료.pdf" }]);
  mocks.get.mockResolvedValue({
    statusCode: 200,
    stream: new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("PDF")); controller.close(); } }),
    blob: { contentType: "application/pdf" },
  });
});

describe("자료실 다운로드", () => {
  it("한글 원본 파일명과 첨부 응답으로 내용을 스트리밍한다", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "guidebooks", id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''%EC%88%98%EC%97%85%20%EC%9E%90%EB%A3%8C.pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toBe("PDF");
    expect(mocks.get).toHaveBeenCalledWith(blobUrl, { access: "public" });
  });

  it("잘못된 종류·ID는 파일이나 DB를 조회하지 않는다", async () => {
    for (const params of [{ kind: "unknown", id }, { kind: "guidebooks", id: "bad" }]) {
      const response = await GET(new Request("http://localhost"), { params: Promise.resolve(params) });
      expect(response.status).toBe(404);
    }
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("다른 저장소 URL이면 외부 요청을 보내지 않는다", async () => {
    mocks.limit.mockResolvedValue([{ fileUrl: "https://example.org/file.pdf", fileName: "자료.pdf" }]);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "weekly-texts", id }) });
    expect(response.status).toBe(404);
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("파일이 삭제되었으면 404를 반환한다", async () => {
    mocks.get.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ kind: "class-materials", id }) });
    expect(response.status).toBe(404);
  });
});

describe("다운로드 입력 검증", () => {
  it("현재 프로젝트 저장소의 HTTPS URL만 허용한다", () => {
    expect(isProjectBlobUrl(blobUrl)).toBe(true);
    expect(isProjectBlobUrl(`http://${projectBlobHost}/file.pdf`)).toBe(false);
    expect(isProjectBlobUrl(`https://${projectBlobHost}.attacker.test/file.pdf`)).toBe(false);
    expect(isProjectBlobUrl(`https://${projectBlobHost}/file.pdf?redirect=1`)).toBe(false);
  });

  it("파일명으로 응답 헤더를 삽입할 수 없다", () => {
    const value = attachmentDisposition('한글/자료"\r\nSet-Cookie: bad.pdf');
    expect(value).not.toContain("\r");
    expect(value).not.toContain("\n");
    expect(value).toContain("filename*=UTF-8''");
  });
});
