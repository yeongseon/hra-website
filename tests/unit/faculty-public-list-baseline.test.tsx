/**
 * #271 공개 교수진 Page의 분류·표시 필드·관리자 순서 계약을 DB 경계 이동 전에 고정합니다.
 * 실제 Page를 렌더링하며 탭에 전달되는 합성 교수 정보와 SQL 정렬 조건을 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  tabs: vi.fn(),
  projection: null as Record<string, unknown> | null,
  order: [] as unknown[],
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/app/(public)/faculty/_components/faculty-tabs", () => ({
  FacultyTabs: (props: unknown) => { mocks.tabs(props); return null; },
}));

import FacultyPage from "@/app/(public)/faculty/page";

const dialect = new PgDialect();
const rows = [
  { id: "one", name: "가 교수", category: "CLASSICS", currentPosition: "현재", formerPosition: null,
    imageUrl: null, order: 1 },
  { id: "two", name: "나 교수", category: "CLASSICS", currentPosition: null, formerPosition: "이전",
    imageUrl: "https://public.invalid/faculty.png", order: 1 },
  { id: "three", name: "다 교수", category: "BUSINESS", currentPosition: null, formerPosition: null,
    imageUrl: null, order: 2 },
  { id: "four", name: "라 교수", category: "LECTURE", currentPosition: null, formerPosition: null,
    imageUrl: null, order: 3 },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.projection = null;
  mocks.order = [];
  mocks.select.mockImplementation((projection: Record<string, unknown>) => {
    mocks.projection = projection;
    return { from: () => ({
      orderBy: (...conditions: unknown[]) => {
        mocks.order = conditions;
        return Promise.resolve(rows);
      },
    }) };
  });
});

it("카테고리별 교수 표시와 현재 공개 필드를 유지한다", async () => {
  const html = renderToStaticMarkup(await FacultyPage());
  expect(html).toContain("교수진 소개");
  expect(mocks.tabs).toHaveBeenCalledOnce();
  const props = mocks.tabs.mock.calls[0][0] as { displayFacultyByCategory: Record<string, typeof rows> };
  expect(Object.keys(props.displayFacultyByCategory)).toEqual(["CLASSICS", "BUSINESS", "LECTURE"]);
  expect(props.displayFacultyByCategory.CLASSICS.map((row) => row.name)).toEqual(["가 교수", "나 교수"]);
  expect(props.displayFacultyByCategory.BUSINESS.map((row) => row.name)).toEqual(["다 교수"]);
  expect(props.displayFacultyByCategory.LECTURE.map((row) => row.name)).toEqual(["라 교수"]);
  expect(Object.keys(mocks.projection ?? {})).toEqual([
    "id", "name", "category", "currentPosition", "formerPosition", "imageUrl", "order",
  ]);
});

it("관리자 order가 앞서고 동점이면 이름 오름차순으로 조회한다", async () => {
  await FacultyPage();
  expect(mocks.order).toHaveLength(2);
  expect(dialect.sqlToQuery(mocks.order[0] as SQL)).toMatchObject({ sql: '"faculty"."order" asc', params: [] });
  expect(dialect.sqlToQuery(mocks.order[1] as SQL)).toMatchObject({ sql: '"faculty"."name" asc', params: [] });
});
