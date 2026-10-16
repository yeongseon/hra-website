/** 실제 공지 목록 페이지에서 중복 쿼리 경계·SQL 바인딩·검색어/페이지 링크를 검증한다. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  countWhere: vi.fn(),
  listWhere: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  offset: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/app/(public)/notices/_components/notice-search", () => ({
  // 이 검증은 서버 경계를 검사한다. 클라이언트 라우터 대신 서버가 전달한 실제 검색어만 렌더링한다.
  NoticeSearch: ({ defaultValue }: { defaultValue: string }) =>
    createElement("input", { name: "q", defaultValue }),
}));

import NoticesPage from "@/app/(public)/notices/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.countWhere.mockResolvedValue([{ total: 31 }]);
  mocks.offset.mockResolvedValue([]);

  const list = {
    where: mocks.listWhere,
    orderBy: mocks.orderBy,
    limit: mocks.limit,
    offset: mocks.offset,
  };
  mocks.listWhere.mockReturnValue(list);
  mocks.orderBy.mockReturnValue(list);
  mocks.limit.mockReturnValue(list);
  mocks.select
    .mockReturnValueOnce({ from: () => ({ where: mocks.countWhere }) })
    .mockReturnValueOnce({ from: () => list });
});

it.each([
  { label: "정상 검색", q: "  공지 & 모집  ", expected: "공지 & 모집" },
  { label: "검색어 누락", q: undefined, expected: "" },
  { label: "빈 검색어", q: "", expected: "" },
  { label: "공백 검색어", q: "   ", expected: "" },
  { label: "중복 키", q: ["첫 검색어", "둘째 검색어"], expected: "" },
  { label: "비어 있는 배열", q: [], expected: "" },
  {
    label: "SQL·HTML 형태도 문자 그대로 검색",
    q: "' OR true; <script>alert(1)</script>",
    expected: "' OR true; <script>alert(1)</script>",
  },
])("$label도 정상 렌더링하고 공개 조건·SQL 매개변수·검색 링크를 보존한다", async ({ q, expected }) => {
  const html = renderToStaticMarkup(
    await NoticesPage({ searchParams: Promise.resolve({ q, page: "2" }) }),
  );
  const document_ = new DOMParser().parseFromString(html, "text/html");
  expect(document_.querySelector<HTMLInputElement>('input[name="q"]')?.value).toBe(expected);
  expect(document_.querySelector("script")).toBeNull();

  const countFilter = mocks.countWhere.mock.calls[0][0];
  const listFilter = mocks.listWhere.mock.calls[0][0];
  expect(listFilter).toBe(countFilter);
  const query = new PgDialect().sqlToQuery(countFilter);
  expect(query.params).toEqual(expected ? ["PUBLISHED", expected] : ["PUBLISHED"]);
  if (expected) {
    expect(query.sql).toContain("strpos(lower(");
    expect(query.sql).not.toContain(expected);
  } else {
    expect(query.sql).not.toContain("strpos");
  }

  expect(mocks.limit).toHaveBeenCalledWith(15);
  expect(mocks.offset).toHaveBeenCalledWith(15);
  const links = [...document_.querySelectorAll<HTMLAnchorElement>('a[href^="/notices?"]')];
  expect(links).toHaveLength(3);
  for (const link of links) {
    const url = new URL(link.getAttribute("href")!, "https://qa.invalid");
    expect(url.searchParams.get("q")).toBe(expected || null);
  }
});

it.each([
  { page: undefined, offset: 0 },
  { page: ["2", "3"], offset: 0 },
  { page: "-1", offset: 0 },
  { page: "99999", offset: 30 },
])("페이지 경계 $page는 기존 보정 정책을 유지한다", async ({ page, offset }) => {
  await NoticesPage({ searchParams: Promise.resolve({ q: "시험", page }) });
  expect(mocks.offset).toHaveBeenCalledWith(offset);
});
