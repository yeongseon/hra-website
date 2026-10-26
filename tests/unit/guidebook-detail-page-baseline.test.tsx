/**
 * #271 가이드북 상세 조회의 인가·엄격 UUID·메타데이터·파일 표시를 경계 이동 전에 고정합니다.
 * 실제 페이지를 합성 DB 결과로 렌더링해 다운로드 프록시와 오류 전파를 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  requireReader: vi.fn(),
  select: vi.fn(),
  limit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/resource-access", () => ({ requireSharedResourceReader: mocks.requireReader }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));

import GuidebookViewerPage, { generateMetadata } from "@/app/(member)/resources/guidebooks/[id]/page";

const id = "11111111-1111-4111-8111-111111111111";
const props = { params: Promise.resolve({ id }) };
const book = { id, title: "합성 가이드북", fileName: "안내.PDF", fileUrl: "private://must-not-render" };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { role: "MEMBER" } });
  mocks.requireReader.mockResolvedValue({ user: { role: "MEMBER" } });
  mocks.limit.mockResolvedValue([book]);
  mocks.select.mockImplementation(() => ({ from: () => ({ where: () => ({ limit: mocks.limit }) }) }));
});

it.each(["MEMBER", "FACULTY", "ADMIN"])("승인된 %s의 메타데이터에는 제목을 표시한다", async (role) => {
  mocks.auth.mockResolvedValue({ user: { role } });
  expect(await generateMetadata(props)).toEqual({ title: "합성 가이드북 — 가이드북" });
  expect(mocks.select).toHaveBeenCalledOnce();
});

it.each([undefined, "PENDING"])("익명·대기 역할 %s는 메타데이터 DB 조회 전에 일반 제목으로 끝난다", async (role) => {
  mocks.auth.mockResolvedValue(role ? { user: { role } } : null);
  expect(await generateMetadata(props)).toEqual({ title: "가이드북" });
  expect(mocks.select).not.toHaveBeenCalled();
});

it("잘못된 UUID는 메타데이터 일반 제목·상세 404로 DB 전에 차단한다", async () => {
  const invalid = { params: Promise.resolve({ id: "invalid-id" }) };
  expect(await generateMetadata(invalid)).toEqual({ title: "가이드북" });
  await expect(GuidebookViewerPage(invalid)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
  expect(mocks.select).not.toHaveBeenCalled();
});

it("없는 가이드북은 일반 메타데이터와 상세 404로 처리한다", async () => {
  mocks.limit.mockResolvedValue([]);
  expect(await generateMetadata(props)).toEqual({ title: "가이드북" });
  await expect(GuidebookViewerPage(props)).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
});

it("페이지 인가 거부는 DB 조회 전에 그대로 전파한다", async () => {
  const denied = new Error("합성 권한 거부");
  mocks.requireReader.mockRejectedValue(denied);
  await expect(GuidebookViewerPage(props)).rejects.toBe(denied);
  expect(mocks.select).not.toHaveBeenCalled();
});

it("대문자 PDF 확장자에도 프록시 iframe과 원래 파일명 다운로드를 유지한다", async () => {
  const html = renderToStaticMarkup(await GuidebookViewerPage(props));
  expect(html).toContain("합성 가이드북");
  expect(html).toContain('href="/resources?category=가이드북"');
  expect(html).toContain(`href="/api/resources/guidebooks/${id}/download"`);
  expect(html).toContain('download="안내.PDF"');
  expect(html).toContain(`src="/api/resources/guidebooks/${id}/download?inline=1#toolbar=1&amp;navpanes=0"`);
  expect(html).toContain('title="합성 가이드북"');
  expect(html).not.toContain(book.fileUrl);
  expect(mocks.requireReader.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
});

it("PDF 이외 파일에는 확장자·파일명 다운로드 안내를 표시한다", async () => {
  mocks.limit.mockResolvedValue([{ ...book, fileName: "안내.docx" }]);
  const html = renderToStaticMarkup(await GuidebookViewerPage(props));
  expect(html).toContain("이 파일 형식(DOCX)은 브라우저에서 미리볼 수 없습니다.");
  expect(html).toContain("다운로드하여 확인해 주세요.");
  expect(html).toContain("안내.docx 다운로드");
  expect(html).not.toContain("<iframe");
  expect(html).not.toContain(book.fileUrl);
});

it("DB 장애를 없는 자료나 일반 메타데이터로 숨기지 않는다", async () => {
  const failure = new Error("합성 DB 장애");
  mocks.limit.mockRejectedValue(failure);
  await expect(generateMetadata(props)).rejects.toBe(failure);
  await expect(GuidebookViewerPage(props)).rejects.toBe(failure);
});
