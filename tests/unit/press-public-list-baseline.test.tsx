/**
 * #271 언론보도 Page의 마지막 페이지 보정·번호·외부 링크·정렬을 경계 이동 전에 고정합니다.
 * 실제 Page 렌더에 합성 DB 결과를 공급하고 관리자가 정한 게시 순서를 확인합니다.
 */
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  links: [] as { articleId: string; href: string }[],
  order: [] as unknown[],
  limit: null as number | null,
  offset: null as number | null,
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/app/(public)/press/_components/press-link", () => ({
  PressLink: ({ articleId, href, children }: { articleId: string; href: string; children: ReactNode }) => {
    mocks.links.push({ articleId, href });
    return <a href={href}>{children}</a>;
  },
}));

import PressPage from "@/app/(public)/press/page";

const dialect = new PgDialect();
const article = {
  id: "11111111-1111-4111-8111-111111111111", title: "합성 언론 기사",
  source: "합성 매체", url: "https://article.invalid/news", viewCount: 7,
  publishedAt: new Date("2026-10-23T18:00:00Z"), description: "내부 설명",
};

/** 건수 조회와 이어지는 게시 목록의 기존 Drizzle 체인을 따로 모방합니다. */
function installRows(total: number, rows = [article]) {
  mocks.select.mockImplementationOnce(() => ({ from: () => Promise.resolve([{ total }]) }));
  mocks.select.mockImplementationOnce(() => ({ from: () => ({
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
  }) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.links.length = 0;
  mocks.order = [];
  mocks.limit = null;
  mocks.offset = null;
});

it("범위 밖 요청을 마지막 페이지로 보정하고 번호·매체·KST 날짜·외부 링크를 표시한다", async () => {
  installRows(16);
  const html = renderToStaticMarkup(await PressPage({ searchParams: Promise.resolve({ page: "999" }) }));
  expect(html).toContain("언론보도");
  expect(html).toContain("합성 언론 기사");
  expect(html).toContain("합성 매체");
  expect(html).toContain("2026.10.24");
  expect(html).toContain("조회");
  expect(html).not.toContain("내부 설명");
  expect(mocks.links).toEqual([{ articleId: article.id, href: article.url }]);
  expect(mocks.limit).toBe(15);
  expect(mocks.offset).toBe(15);
  expect(html).toContain('href="/press?page=1"');
  expect(html).toContain('href="/press?page=2"');
  expect(html).toMatch(/>1<\/span>/);

  expect(mocks.order).toHaveLength(3);
  expect(dialect.sqlToQuery(mocks.order[0] as SQL).sql).toBe('"press_articles"."order" asc');
  expect(dialect.sqlToQuery(mocks.order[1] as SQL).sql).toBe('"press_articles"."published_at" desc');
  expect(dialect.sqlToQuery(mocks.order[2] as SQL).sql).toBe('"press_articles"."id" desc');
});

it("자료가 없으면 외부 링크나 페이지 버튼 없이 빈 목록을 표시한다", async () => {
  installRows(0, []);
  const html = renderToStaticMarkup(await PressPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("등록된 언론보도가 없습니다");
  expect(mocks.links).toEqual([]);
  expect(html).not.toContain('href="/press?page=2"');
  expect(mocks.limit).toBe(15);
  expect(mocks.offset).toBe(0);
});
