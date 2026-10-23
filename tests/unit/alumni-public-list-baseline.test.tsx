/**
 * #271 수료생 목록의 페이지 보정·카드 링크·요약·색 순서를 DB 경계 이동 전에 고정합니다.
 * Page를 합성 건수·행으로 렌더링하고 본문 대신 기존 180자 SQL 요약 투영을 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  images: [] as { src: string; alt: string }[],
  projection: null as Record<string, unknown> | null,
  order: [] as unknown[],
  limit: null as number | null,
  offset: null as number | null,
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    mocks.images.push({ src, alt });
    return null;
  },
}));

import AlumniPage from "@/app/(public)/alumni/page";

const dialect = new PgDialect();
type AlumniRow = { id: string; name: string; quote: string; summary: string;
  title: string | null; imageUrl: string | null };
const secondPage: AlumniRow[] = [
  { id: "one", name: "합성 수료생 하나", quote: "첫 인용", summary: "첫 평문 요약",
    title: null, imageUrl: null },
  { id: "two", name: "합성 수료생 둘", quote: "둘째 인용", summary: "둘째 평문 요약",
    title: "합성 직함", imageUrl: null },
];

/** 건수 다음 목록 SELECT의 기존 Drizzle await 체인을 별도로 모방합니다. */
function installRows(total: number, rows: AlumniRow[] = secondPage) {
  mocks.select.mockImplementationOnce(() => ({ from: () => Promise.resolve([{ total }]) }));
  mocks.select.mockImplementationOnce((projection: Record<string, unknown>) => {
    mocks.projection = projection;
    return { from: () => ({
      orderBy: (...conditions: unknown[]) => {
        mocks.order = conditions;
        return { limit: (limit: number) => {
          mocks.limit = limit;
          return { offset: (offset: number) => {
            mocks.offset = offset;
            return Promise.resolve(rows);
          } };
        } };
      },
    }) };
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.images.length = 0;
  mocks.projection = null;
  mocks.order = [];
  mocks.limit = null;
  mocks.offset = null;
});

it("범위 밖 요청을 마지막 페이지로 보정해 링크·요약·페이지 간 그라데이션을 유지한다", async () => {
  installRows(17);
  const html = renderToStaticMarkup(await AlumniPage({ searchParams: Promise.resolve({ page: "999" }) }));
  expect(html).toContain("수료생 이야기");
  expect(html).toContain('href="/alumni/one"');
  expect(html).toContain('href="/alumni/two"');
  expect(html).toContain("첫 평문 요약");
  expect(html).toContain("둘째 평문 요약");
  expect(html).toContain("합성 직함");
  expect(html.indexOf("from-amber-700")).toBeLessThan(html.indexOf("from-blue-700"));
  expect(html).toContain('href="/alumni?page=1"');
  expect(html).toContain('href="/alumni?page=2"');
  expect(mocks.limit).toBe(15);
  expect(mocks.offset).toBe(15);
  expect(Object.keys(mocks.projection ?? {})).toEqual(["id", "name", "quote", "summary", "title", "imageUrl"]);
  expect(dialect.sqlToQuery((mocks.projection ?? {}).summary as SQL).sql).toContain("left(trim(regexp_replace");
  expect(mocks.order.map((condition) => dialect.sqlToQuery(condition as SQL).sql)).toEqual([
    '"alumni_stories"."pinned" desc', '"alumni_stories"."created_at" desc',
    '"alumni_stories"."id" desc',
  ]);
});

it("대표 이미지가 있는 카드와 빈 목록 화면을 각각 유지한다", async () => {
  installRows(1, [{ ...secondPage[0], imageUrl: "https://public.invalid/alumni.jpg" }]);
  const html = renderToStaticMarkup(await AlumniPage({ searchParams: Promise.resolve({}) }));
  expect(mocks.images).toEqual([{ src: "https://public.invalid/alumni.jpg", alt: "합성 수료생 하나 수료생 사진" }]);
  expect(html).not.toContain("아직 등록된 수료생 이야기가 없습니다.");

  vi.resetAllMocks();
  mocks.images.length = 0;
  installRows(0, []);
  const emptyHtml = renderToStaticMarkup(await AlumniPage({ searchParams: Promise.resolve({}) }));
  expect(emptyHtml).toContain("아직 등록된 수료생 이야기가 없습니다.");
  expect(mocks.images).toEqual([]);
});
