/**
 * #271 갤러리 상세의 사진 순서·메타데이터·표시를 DB 경계 이동 전에 고정합니다.
 * 합성 앨범을 실제 Page에 공급하며 첫 사진 OG와 빈 앨범 상태를 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  after: vi.fn(),
  images: [] as { src: string; alt: string }[],
}));
vi.mock("@/lib/db", () => ({ db: { query: { galleries: { findFirst: mocks.findFirst } } } }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    mocks.images.push({ src, alt });
    return null;
  },
}));

import GalleryDetailPage, { generateMetadata } from "@/app/(public)/gallery/[id]/page";

const dialect = new PgDialect();
const id = "11111111-1111-4111-8111-111111111111";
const props = { params: Promise.resolve({ id }) };
const gallery = {
  id, title: "합성 앨범", description: "첫 줄\n둘째 줄", viewCount: 7,
  images: [
    { id: "a", url: "https://public.invalid/first.jpg", alt: "첫 사진", order: 1,
      createdAt: new Date("2026-10-23T00:00:00Z") },
    { id: "b", url: "https://public.invalid/second.jpg", alt: null, order: 2,
      createdAt: new Date("2026-10-24T00:00:00Z") },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.images.length = 0;
  mocks.findFirst.mockResolvedValue(gallery);
});

it("사진의 관리자 순서·작성 시각 동점 정렬과 첫 이미지 OG를 유지한다", async () => {
  const metadata = await generateMetadata(props);
  expect(metadata).toMatchObject({
    title: "합성 앨범",
    description: "첫 줄\n둘째 줄",
    openGraph: { url: `/gallery/${id}`, images: [{ url: "https://public.invalid/first.jpg", alt: "합성 앨범" }] },
    twitter: { images: ["https://public.invalid/first.jpg"] },
  });
  expect(mocks.after).not.toHaveBeenCalled();

  const options = mocks.findFirst.mock.calls[0][0] as { with: { images: { orderBy: SQL[] } } };
  expect(options.with.images.orderBy).toHaveLength(2);
  expect(dialect.sqlToQuery(options.with.images.orderBy[0]).sql).toBe('"gallery_images"."order" asc');
  expect(dialect.sqlToQuery(options.with.images.orderBy[1]).sql).toBe('"gallery_images"."created_at" asc');
});

it("상세에는 사진 링크·대체 텍스트·기존 조회수를 표시하고 after만 등록한다", async () => {
  const html = renderToStaticMarkup(await GalleryDetailPage(props));
  expect(html).toContain("합성 앨범");
  expect(html).toContain("조회수 7");
  expect(html).toContain("첫 줄\n둘째 줄");
  expect(html).toContain('href="https://public.invalid/first.jpg"');
  expect(html).toContain('href="https://public.invalid/second.jpg"');
  expect(mocks.images).toEqual([
    { src: "https://public.invalid/first.jpg", alt: "첫 사진" },
    { src: "https://public.invalid/second.jpg", alt: "합성 앨범 이미지 2" },
  ]);
  expect(mocks.after).toHaveBeenCalledOnce();
});

it("사진이 없는 앨범은 기존 빈 상태와 이미지 없는 메타데이터를 유지한다", async () => {
  mocks.findFirst.mockResolvedValue({ ...gallery, images: [] });
  expect((await generateMetadata(props)).openGraph).toMatchObject({ title: "합성 앨범" });
  const html = renderToStaticMarkup(await GalleryDetailPage(props));
  expect(html).toContain("등록된 이미지가 없습니다.");
  expect(mocks.images).toEqual([]);
});
