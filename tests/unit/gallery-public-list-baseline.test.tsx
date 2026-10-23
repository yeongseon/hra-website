/**
 * #271 공개 갤러리 Page의 앨범 카드·커버·사진 수·상세 링크를 경계 이동 전에 고정합니다.
 * 실제 Page를 합성 앨범으로 렌더링하고 작성일 정렬 SQL을 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  images: [] as string[],
}));
vi.mock("@/lib/db", () => ({ db: { query: { galleries: { findMany: mocks.findMany } } } }));
vi.mock("next/image", () => ({
  default: ({ src }: { src: string; alt: string }) => {
    mocks.images.push(src);
    return null;
  },
}));

import GalleryPage from "@/app/(public)/gallery/page";

const dialect = new PgDialect();
const albums = [
  { id: "one", title: "합성 첫 앨범", coverImageUrl: "https://public.invalid/cover.jpg",
    viewCount: 5, createdAt: new Date("2026-10-24T00:00:00Z"), images: [{ id: "a" }, { id: "b" }],
    description: "내부 설명" },
  { id: "two", title: "합성 빈 앨범", coverImageUrl: "https://public.invalid/unused.jpg",
    viewCount: 2, createdAt: new Date("2026-10-23T00:00:00Z"), images: [] },
  { id: "three", title: "커버 없는 앨범", coverImageUrl: null,
    viewCount: 1, createdAt: new Date("2026-10-22T00:00:00Z"), images: [{ id: "c" }] },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.images.length = 0;
  mocks.findMany.mockResolvedValue(albums);
});

it("사진이 있는 앨범에만 커버를 표시하고 사진 수·조회수·UUID 링크를 유지한다", async () => {
  const html = renderToStaticMarkup(await GalleryPage());
  expect(html).toContain("갤러리");
  expect(mocks.images).toEqual(["https://public.invalid/cover.jpg"]);
  expect(html).toContain('href="/gallery/one"');
  expect(html).toContain('href="/gallery/two"');
  expect(html).toContain('href="/gallery/three"');
  expect(html).toContain("이미지 2장 · 조회 5");
  expect(html).toContain("이미지 0장 · 조회 2");
  expect(html).toContain("이미지 1장 · 조회 1");
  expect(html.indexOf("합성 첫 앨범")).toBeLessThan(html.indexOf("합성 빈 앨범"));
  expect(html).not.toContain("내부 설명");

  const options = mocks.findMany.mock.calls[0][0] as {
    orderBy: SQL[];
    with: { images: { columns: { id: boolean } } };
  };
  expect(options.with.images.columns).toEqual({ id: true });
  expect(dialect.sqlToQuery(options.orderBy[0])).toMatchObject({ sql: '"galleries"."created_at" desc', params: [] });
});

it("앨범이 없으면 기존 빈 상태를 표시한다", async () => {
  mocks.findMany.mockResolvedValueOnce([]);
  const html = renderToStaticMarkup(await GalleryPage());
  expect(html).toContain("갤러리가 없습니다");
  expect(mocks.images).toEqual([]);
});
