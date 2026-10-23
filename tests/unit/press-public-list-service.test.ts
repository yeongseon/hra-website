/**
 * 언론보도 목록 Service의 페이지 보정과 공개 표시 필드 경계를 확인합니다.
 * 저장소에 설명·이미지 등 추가 열이 섞여도 Page에는 전달하지 않습니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), list: vi.fn() }));
vi.mock("@/features/press/public-list/repository", () => ({
  countPressArticles: mocks.count,
  listPressArticleRows: mocks.list,
}));

import { listPublicPressArticles } from "@/features/press/public-list/service";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(16);
  mocks.list.mockResolvedValue([{ id: "one", title: "합성 기사", source: "합성 매체",
    url: "https://article.invalid/one", publishedAt: new Date("2026-10-24T00:00:00Z"),
    viewCount: 3, description: "내부 설명", imageUrl: "private://image", createdAt: new Date() }]);
});

it("범위 밖 페이지를 마지막 15행 경계로 보정하고 여섯 표시 필드만 반환한다", async () => {
  const result = await listPublicPressArticles("999");
  expect(result).toMatchObject({ totalCount: 16, currentPage: 2, totalPages: 2, startIndex: 15 });
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith(15, 15);
  expect(Object.keys(result.currentArticles[0])).toEqual([
    "id", "title", "source", "url", "publishedAt", "viewCount",
  ]);
  expect(JSON.stringify(result)).not.toMatch(/내부 설명|private:|imageUrl|createdAt/);
});

it("잘못된 페이지는 첫 페이지로 보정하고 빈 전체 건수도 기존 쿼리를 유지한다", async () => {
  expect((await listPublicPressArticles("abc")).currentPage).toBe(1);
  expect(mocks.list).toHaveBeenCalledWith(15, 0);
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(0);
  mocks.list.mockResolvedValue([]);
  expect(await listPublicPressArticles(undefined)).toEqual({
    currentArticles: [], totalCount: 0, currentPage: 1, totalPages: 0, startIndex: 0,
  });
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith(15, 0);
});

it("건수 조회 실패를 빈 목록으로 위장하지 않는다", async () => {
  const failure = new Error("synthetic database failure");
  mocks.count.mockRejectedValueOnce(failure);
  await expect(listPublicPressArticles("1")).rejects.toBe(failure);
  expect(mocks.list).not.toHaveBeenCalled();
});
