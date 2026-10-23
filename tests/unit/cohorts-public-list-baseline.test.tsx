/**
 * #271 기수 Page의 공개 조건·숫자 순서·DB 실패 표시를 경계 이동 전에 고정합니다.
 * 합성 DB 행으로 실제 Page를 렌더링하고 SQL 조건과 사용자에게 보이는 상태를 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  log: vi.fn(),
  projection: null as Record<string, unknown> | null,
  where: null as unknown,
  order: null as unknown,
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import CohortsPage from "@/app/(public)/cohorts/page";

const dialect = new PgDialect();
const rows = [
  { name: "20기", startDate: new Date("2026-01-01T00:00:00Z"),
    endDate: new Date("2026-10-01T00:00:00Z"), description: "합성 소개", isActive: true,
    imageUrl: null, order: 1 },
  { name: "1기", startDate: null, endDate: null, description: null,
    isActive: false, imageUrl: null, order: 2 },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.projection = null;
  mocks.where = null;
  mocks.order = null;
  mocks.select.mockImplementation((projection: Record<string, unknown>) => {
    mocks.projection = projection;
    return { from: () => ({
      where: (condition: unknown) => {
        mocks.where = condition;
        return { orderBy: (order: unknown) => {
          mocks.order = order;
          return Promise.resolve(rows);
        } };
      },
    }) };
  });
});

it("시작일 공개 조건과 기수 숫자 내림차순을 적용해 기존 카드·집계를 표시한다", async () => {
  const html = renderToStaticMarkup(await CohortsPage());
  expect(html).toContain("총 2기");
  expect(html.indexOf("20기")).toBeLessThan(html.indexOf("1기"));
  expect(html).toContain("진행 중");
  expect(html).toContain("수료");
  expect(html).toContain("합성 소개");
  expect(Object.keys(mocks.projection ?? {})).toEqual([
    "name", "startDate", "endDate", "description", "isActive", "imageUrl",
  ]);

  const where = dialect.sqlToQuery(mocks.where as SQL);
  expect(where.sql).toContain('"cohorts"."start_date"');
  expect(where.sql).toContain("is null");
  expect(where.sql).toContain("<=");
  expect(where.params).toHaveLength(1);
  expect(where.params[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  const order = dialect.sqlToQuery(mocks.order as SQL);
  expect(order.sql).toContain("regexp_replace");
  expect(order.sql).toContain("DESC NULLS LAST");
});

it("DB 조회 실패는 정제 로그와 빈 목록 화면으로 구분한다", async () => {
  const failure = new Error("synthetic query failure");
  mocks.select.mockImplementationOnce(() => ({ from: () => ({
    where: () => ({ orderBy: () => Promise.reject(failure) }),
  }) }));
  const html = renderToStaticMarkup(await CohortsPage());
  expect(html).toContain("등록된 기수가 없습니다");
  expect(html).toContain("총 0기");
  expect(mocks.log).toHaveBeenCalledExactlyOnceWith("public/cohorts", failure);
});
