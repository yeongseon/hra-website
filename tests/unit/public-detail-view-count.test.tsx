/**
 * #298: 공지·갤러리 상세 페이지의 조회수 작업이 응답 후 수명주기에 등록되는지 검증한다.
 * 실제 페이지를 렌더링하되 DB와 after 실행 시점만 격리해 SQL 완료 대기와 실패 로깅을 확인한다.
 * 요청당 등록 계약을 보호하며 방문자 중복 제거·봇 제외·정확히 한 번 집계를 보장하지 않는다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { galleries, notices } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  noticeFindFirst: vi.fn(),
  galleryFindFirst: vi.fn(),
  select: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  updateWhere: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      notices: { findFirst: mocks.noticeFindFirst },
      galleries: { findFirst: mocks.galleryFindFirst },
    },
    select: mocks.select,
    update: mocks.update,
  },
}));

import NoticeDetailPage, { generateMetadata as noticeMetadata } from "@/app/(public)/notices/[id]/page";
import GalleryDetailPage, { generateMetadata as galleryMetadata } from "@/app/(public)/gallery/[id]/page";

// after는 콜백을 보관하고, 테스트가 응답 HTML을 확인한 뒤에만 실행한다.
const afterCallbacks: Array<() => void | Promise<void>> = [];
const itemId = "10000000-0000-4000-8000-000000000001";
const dialect = new PgDialect();
const cases = [
  {
    label: "공지", page: NoticeDetailPage, metadata: noticeMetadata,
    findFirst: mocks.noticeFindFirst, table: notices, tableName: "notices",
    scope: "public/notices/viewCount", title: "수업 안내",
  },
  {
    label: "갤러리", page: GalleryDetailPage, metadata: galleryMetadata,
    findFirst: mocks.galleryFindFirst, table: galleries, tableName: "galleries",
    scope: "public/gallery/viewCount", title: "수업 사진",
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  afterCallbacks.length = 0;
  mocks.after.mockImplementation((callback: () => void | Promise<void>) => {
    afterCallbacks.push(callback);
  });
  mocks.noticeFindFirst.mockResolvedValue({
    id: itemId, title: "수업 안내", content: "공개 공지 본문", status: "PUBLISHED",
    viewCount: 12, createdAt: new Date("2026-10-20T00:00:00Z"),
  });
  mocks.galleryFindFirst.mockResolvedValue({
    id: itemId, title: "수업 사진", description: "공개 갤러리 설명", images: [], viewCount: 12,
  });
  // 공지의 이전글/다음글 조회는 조회수 UPDATE와 별개로 정상 완료한다.
  mocks.select.mockReturnValue({
    from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [] }) }) }),
  });
  mocks.update.mockReturnValue({ set: mocks.set });
  mocks.set.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe.each(cases)("$label 상세 조회수 응답 수명주기", ({ page, metadata, findFirst, table, tableName, scope, title }) => {
  it("페이지는 기존 조회수로 응답하고 after 콜백은 원자 SQL의 실제 완료까지 기다린다", async () => {
    let finishUpdate: () => void = () => { throw new Error("SQL 완료 함수가 설정되지 않았습니다"); };
    mocks.updateWhere.mockReturnValue(new Promise<void>((resolve) => { finishUpdate = resolve; }));

    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: itemId }) }));
    expect(html).toContain(title);
    expect(html).toMatch(/조회수(?:\s|:)*12/);
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(afterCallbacks).toHaveLength(1);
    expect(mocks.update).not.toHaveBeenCalled();

    // 응답 후 작업을 시작해도 SQL이 미완료면 플랫폼에 반환된 Promise는 완료되면 안 된다.
    const completion = afterCallbacks[0]();
    expect(completion).toBeInstanceOf(Promise);
    let completed = false;
    const observed = Promise.resolve(completion).then(() => { completed = true; });
    await Promise.resolve();
    expect(completed).toBe(false);
    expect(mocks.update).toHaveBeenCalledWith(table);
    expect(mocks.set).toHaveBeenCalledOnce();
    expect(Object.keys(mocks.set.mock.calls[0][0])).toEqual(["viewCount"]);
    expect(dialect.sqlToQuery(mocks.set.mock.calls[0][0].viewCount)).toMatchObject({
      sql: `"${tableName}"."view_count" + 1`, params: [],
    });
    expect(dialect.sqlToQuery(mocks.updateWhere.mock.calls[0][0])).toMatchObject({
      sql: `"${tableName}"."id" = $1`, params: [itemId],
    });

    finishUpdate();
    await observed;
    expect(completed).toBe(true);
    expect(console.error).not.toHaveBeenCalled();
  });

  it("조회수 SQL이 실패해도 페이지 응답을 유지하고 허용 필드 로그에 식별자만 남긴다", async () => {
    const error = new Error("Failed query: UPDATE synthetic_table SET email = 'synthetic@example.test'");
    // 페이지가 응답한 뒤 after를 실행할 때에만 거부되는 Promise를 만든다.
    mocks.updateWhere.mockImplementation(() => Promise.reject(error));
    const html = renderToStaticMarkup(await page({ params: Promise.resolve({ id: itemId }) }));
    expect(html).toContain(title);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(console.error).not.toHaveBeenCalled();
    expect(afterCallbacks).toHaveLength(1);

    await expect(afterCallbacks[0]()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith(`[${scope}]`, {
      context: { id: itemId },
      error: { kind: "ERROR" },
    });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toMatch(/synthetic@example|UPDATE synthetic_table/);
    expect(html).toMatch(/조회수(?:\s|:)*12/);
  });

  it.each(["잘못된 ID", "없는 게시물"])("%s에는 조회수 작업을 등록하지 않는다", async (reason) => {
    if (reason === "없는 게시물") findFirst.mockResolvedValue(null);
    const id = reason === "잘못된 ID" ? "invalid-id" : itemId;
    await expect(page({ params: Promise.resolve({ id }) })).rejects.toThrow("NEXT_HTTP_ERROR_FALLBACK;404");
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    if (reason === "잘못된 ID") expect(findFirst).not.toHaveBeenCalled();
  });

  it("메타데이터 조회만으로는 조회수를 갱신하거나 after 작업을 등록하지 않는다", async () => {
    expect(await metadata({ params: Promise.resolve({ id: itemId }) })).toMatchObject({ title });
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
