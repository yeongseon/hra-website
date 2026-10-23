/**
 * #271 홈 수료생 carousel의 featured 필터·관리자 순서·색상 순환을 DB 경계 이동 전에 고정합니다.
 * 서버 컴포넌트를 합성 행으로 렌더링하고 클라이언트 슬라이드에 전달되는 필드를 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  client: vi.fn(),
  projection: null as Record<string, unknown> | null,
  where: null as unknown,
  order: null as unknown,
  rows: [] as unknown[],
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/app/(public)/_components/alumni-carousel-client", () => ({
  AlumniCarouselClient: (props: unknown) => { mocks.client(props); return null; },
}));

import { AlumniCarousel } from "@/app/(public)/_components/alumni-carousel";

const dialect = new PgDialect();
const rows = [
  { id: "a", name: "가 수료생", title: "합성 직함", quote: "첫 인용", imageUrl: null },
  { id: "b", name: "나 수료생", title: null, quote: "둘째 인용", imageUrl: "https://public.invalid/b.jpg" },
  { id: "c", name: "다 수료생", title: null, quote: "셋째 인용", imageUrl: null },
  { id: "d", name: "라 수료생", title: null, quote: "넷째 인용", imageUrl: null },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.projection = null;
  mocks.where = null;
  mocks.order = null;
  mocks.rows = rows;
  mocks.select.mockImplementation((projection: Record<string, unknown>) => {
    mocks.projection = projection;
    return { from: () => ({ where: (condition: unknown) => {
      mocks.where = condition;
      return { orderBy: (order: unknown) => {
        mocks.order = order;
        return Promise.resolve(mocks.rows);
      } };
    } }) };
  });
});

it("featured만 관리자 순서로 읽고 세 색상과 다섯 공개 필드를 반복 전달한다", async () => {
  renderToStaticMarkup(await AlumniCarousel());
  expect(mocks.client).toHaveBeenCalledOnce();
  const slides = (mocks.client.mock.calls[0][0] as { slides: Array<Record<string, unknown>> }).slides;
  expect(slides.map((slide) => slide.name)).toEqual(["가 수료생", "나 수료생", "다 수료생", "라 수료생"]);
  expect(slides.map((slide) => slide.gradient)).toEqual([
    "from-amber-700 via-amber-800 to-stone-900",
    "from-blue-700 via-blue-800 to-slate-900",
    "from-emerald-700 via-emerald-800 to-slate-900",
    "from-amber-700 via-amber-800 to-stone-900",
  ]);
  expect(Object.keys(slides[0])).toEqual(["id", "name", "title", "quote", "imageUrl", "gradient"]);
  expect(Object.keys(mocks.projection ?? {})).toEqual(["id", "name", "title", "quote", "imageUrl"]);
  expect(dialect.sqlToQuery(mocks.where as SQL)).toMatchObject({ sql: '"alumni_stories"."is_featured" = $1', params: [true] });
  expect(dialect.sqlToQuery(mocks.order as SQL)).toMatchObject({ sql: '"alumni_stories"."order" asc', params: [] });
});

it("featured가 없으면 클라이언트 carousel을 렌더링하지 않는다", async () => {
  mocks.rows = [];
  expect(await AlumniCarousel()).toBeNull();
  expect(mocks.client).not.toHaveBeenCalled();
});
