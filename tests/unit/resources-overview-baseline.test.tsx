/**
 * #271 자료실 Page의 DB 경계 이동 전 표시 계약을 고정합니다.
 * 합성 DB 행을 공급하되 탭에 전달되는 다섯 자료 유형·경로·전역 날짜 순서를 실제 Page 렌더로 확인합니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";
import { classLogs, classMaterials, cohorts, guidebooks, reportTemplates, weeklyTexts } from "@/lib/db/schema";
import type { ResourceItem } from "@/app/(member)/resources/_components/resources-tabs";

type QueryRecord = { table: unknown; where: unknown[] };
type CapturedTabs = {
  initialCategory?: string;
  items: ResourceItem[];
  cohorts: { id: string; name: string }[];
  userCohortId: string | null;
  userRole: string | null;
};

const mocks = vi.hoisted(() => ({
  requireReader: vi.fn(),
  findProfile: vi.fn(),
  select: vi.fn(),
  tabs: vi.fn(),
  rows: new Map<unknown, unknown[]>(),
  queries: [] as QueryRecord[],
}));

vi.mock("@/lib/resource-access", () => ({ requireSharedResourceReader: mocks.requireReader }));
vi.mock("@/lib/db", () => ({ db: {
  query: { users: { findFirst: mocks.findProfile } },
  select: mocks.select,
} }));
vi.mock("@/app/(member)/resources/_components/resources-tabs", () => ({
  ResourcesTabs: (props: CapturedTabs) => {
    mocks.tabs(props);
    return null;
  },
}));

import ResourcesPage from "@/app/(member)/resources/page";

const dialect = new PgDialect();
const userId = "11111111-1111-4111-8111-111111111111";
const cohortId = "22222222-2222-4222-8222-222222222222";
const on = (day: number) => new Date(`2026-10-${String(day).padStart(2, "0")}T00:00:00.000Z`);

/** Repository의 Drizzle await 인터페이스만 흉내 내며 각 표에 합성 행을 연결합니다. */
function queryBuilder() {
  let table: unknown;
  let record: QueryRecord | undefined;
  const builder = {
    from(value: unknown) {
      table = value;
      record = { table, where: [] };
      mocks.queries.push(record);
      return this;
    },
    leftJoin() { return this; },
    where(condition: unknown) {
      record?.where.push(condition);
      return this;
    },
    orderBy() { return this; },
    limit() { return this; },
    then(onFulfilled: (value: unknown[]) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(mocks.rows.get(table) ?? []).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rows.clear();
  mocks.queries.length = 0;
  mocks.select.mockImplementation(queryBuilder);
  mocks.requireReader.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.findProfile.mockResolvedValue({ id: userId, role: "MEMBER", name: "합성 회원",
    email: "member@fixture.invalid", cohortId, image: null });
  mocks.rows.set(cohorts, [{ id: cohortId, name: "20기" }, { id: "older", name: "9기" }]);
  mocks.rows.set(classLogs, [{ id: "log", title: "합성 일지", classDate: on(16), createdAt: on(17),
    authorName: "합성 작성자", cohortId }]);
  mocks.rows.set(weeklyTexts, [
    { id: "body", title: "본문 텍스트", hasBody: true, hasFile: false, body: "합성 본문", fileUrl: null, classDate: on(20),
      createdAt: on(13), cohortId, textType: "고전명작" },
    { id: "file", title: "파일 텍스트", hasBody: false, hasFile: true,
      body: null, fileUrl: "https://private.invalid/text.pdf",
      classDate: null, createdAt: on(14), cohortId, textType: null },
  ]);
  mocks.rows.set(classMaterials, [{ id: "material", title: "합성 강의", classDate: on(22),
    createdAt: on(15), audience: "STUDENT", weekNumber: 2, lectureTitle: "강의 제목",
    uploaderName: "합성 교수" }]);
  mocks.rows.set(guidebooks, [{ id: "book", title: "합성 가이드북", createdAt: on(18),
    fileUrl: "https://private.invalid/guide.pdf", fileName: "비공개 원본.pdf" }]);
  mocks.rows.set(reportTemplates, [
    { id: "guide", slug: "guide-slug", title: "합성 가이드", category: "guide", createdAt: on(21) },
    { id: "template", slug: "template-slug", title: "합성 양식", category: "template", createdAt: on(12) },
  ]);
});

it("승인 회원의 다섯 자료 유형·경로·전역 날짜 순서와 탭 인자를 유지한다", async () => {
  const element = await ResourcesPage({ searchParams: Promise.resolve({ category: "주차별 텍스트" }) });
  const html = renderToStaticMarkup(element);
  expect(html).toContain("자료실");
  expect(html).not.toContain("/admin/resources/new");
  expect(mocks.requireReader).toHaveBeenCalledOnce();
  expect(mocks.findProfile).toHaveBeenCalledOnce();
  expect(mocks.tabs).toHaveBeenCalledOnce();

  const props = mocks.tabs.mock.calls[0][0] as CapturedTabs;
  expect(props.initialCategory).toBe("주차별 텍스트");
  expect(props.userRole).toBe("MEMBER");
  expect(props.userCohortId).toBe(cohortId);
  expect(props.cohorts).toEqual([{ id: cohortId, name: "20기" }, { id: "older", name: "9기" }]);
  expect(props.items.map((item) => item.id)).toEqual([
    "cm-material", "tmpl-guide", "text-body", "guide-book", "log-log", "text-file", "tmpl-template",
  ]);
  expect(props.items.map((item) => item.category)).toEqual([
    "강의 자료", "보고서 양식", "주차별 텍스트", "가이드북",
    "주차별 수업일지", "주차별 텍스트", "보고서 양식",
  ]);
  expect(props.items.map((item) => item.date)).toEqual([on(22), on(21), on(20), on(18), on(16), on(14), on(12)]);
  expect(props.items[0]).toMatchObject({ href: "/resources/class-materials/material", audience: "STUDENT",
    weekNumber: 2, lectureTitle: "강의 제목", author: "합성 교수", cohortId: null });
  expect(props.items[1]).toMatchObject({ href: "/member/guides/guide-slug" });
  expect(props.items[2]).toMatchObject({ href: "/resources/weekly-texts/body", textType: "고전명작" });
  expect(props.items[3]).toMatchObject({ href: "/resources/guidebooks/book", cohortId: null });
  expect(props.items[4]).toMatchObject({ href: "/resources/log", author: "합성 작성자", cohortId });
  expect(props.items[5]).toMatchObject({ downloadUrl: "/api/resources/weekly-texts/file/download", textType: null });
  expect(props.items[5].href).toBeUndefined();
  expect(props.items[6]).toMatchObject({ href: "/member/templates/template-slug" });
  expect(JSON.stringify(props.items)).not.toMatch(/private\.invalid|비공개 원본/);
});

it("강의자료는 SQL 대상 필터, 보고서 양식은 published 조건을 조회에 적용한다", async () => {
  await ResourcesPage({ searchParams: Promise.resolve({}) });
  expect(mocks.queries).toHaveLength(6);
  const classMaterialQuery = mocks.queries.find((query) => query.table === classMaterials);
  const templateQuery = mocks.queries.find((query) => query.table === reportTemplates);
  expect(classMaterialQuery?.where).toHaveLength(1);
  expect(dialect.sqlToQuery(classMaterialQuery?.where[0] as SQL).params).toEqual(["STUDENT"]);
  expect(templateQuery?.where).toHaveLength(1);
  expect(dialect.sqlToQuery(templateQuery?.where[0] as SQL).params).toEqual([true]);
});

it("승인 대기 계정은 어떤 자료 조회보다 먼저 차단한다", async () => {
  mocks.requireReader.mockRejectedValueOnce(new Error("REDIRECT:/pending"));
  await expect(ResourcesPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/pending");
  expect(mocks.findProfile).not.toHaveBeenCalled();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.tabs).not.toHaveBeenCalled();
});
