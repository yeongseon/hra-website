/**
 * 수료생 목록 Service의 마지막 페이지 보정과 표시 필드 제한을 확인합니다.
 * 저장소에 전체 본문·고정 상태가 있더라도 Page에는 짧은 요약만 전달합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ count: vi.fn(), list: vi.fn() }));
vi.mock("@/features/alumni/public-list/repository", () => ({
  countAlumniStories: mocks.count,
  listAlumniStoryRows: mocks.list,
}));

import { listPublicAlumniStories } from "@/features/alumni/public-list/service";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(17);
  mocks.list.mockResolvedValue([{ id: "one", name: "합성 수료생", quote: "합성 인용",
    summary: "짧은 평문", title: null, imageUrl: null,
    content: "비공개 전체 본문", pinned: true, viewCount: 99 }]);
});

it("범위 밖 page를 마지막 15행 경계로 보정하고 여섯 필드만 반환한다", async () => {
  const result = await listPublicAlumniStories("999");
  expect(result).toMatchObject({ totalCount: 17, currentPage: 2, totalPages: 2, startIndex: 15 });
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith(15, 15);
  expect(Object.keys(result.items[0])).toEqual(["id", "name", "quote", "summary", "title", "imageUrl"]);
  expect(JSON.stringify(result)).not.toMatch(/비공개 전체 본문|"content"|"pinned"|"viewCount"/);
});

it("잘못된 page와 빈 전체 건수는 첫 페이지 경계를 유지한다", async () => {
  expect((await listPublicAlumniStories("abc")).currentPage).toBe(1);
  expect(mocks.list).toHaveBeenCalledWith(15, 0);
  vi.resetAllMocks();
  mocks.count.mockResolvedValue(0);
  mocks.list.mockResolvedValue([]);
  expect(await listPublicAlumniStories(undefined)).toEqual({
    items: [], totalCount: 0, currentPage: 1, totalPages: 0, startIndex: 0,
  });
  expect(mocks.list).toHaveBeenCalledExactlyOnceWith(15, 0);
});

it("저장소 실패를 정상 빈 목록으로 바꾸지 않는다", async () => {
  const failure = new Error("synthetic database failure");
  mocks.count.mockRejectedValueOnce(failure);
  await expect(listPublicAlumniStories("1")).rejects.toBe(failure);
  expect(mocks.list).not.toHaveBeenCalled();
});
