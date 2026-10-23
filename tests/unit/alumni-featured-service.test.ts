/**
 * featured 수료생 Service가 저장소의 내부 열을 제거하고 공개 카드 필드만 반환하는지 확인합니다.
 * 조회 오류는 빈 carousel로 숨기지 않고 상위 화면에 전파합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listFeaturedAlumniRows: vi.fn() }));
vi.mock("@/features/alumni/featured/repository", () => ({
  listFeaturedAlumniRows: mocks.listFeaturedAlumniRows,
}));

import { listFeaturedAlumni } from "@/features/alumni/featured/service";

beforeEach(() => vi.resetAllMocks());

it("본문·조회수·featured 상태가 섞인 저장소 행에서 다섯 공개 필드만 남긴다", async () => {
  mocks.listFeaturedAlumniRows.mockResolvedValue([{ id: "one", name: "합성 수료생",
    title: null, quote: "합성 인용", imageUrl: null,
    content: "내부 전체 본문", viewCount: 99, isFeatured: true }]);
  expect(await listFeaturedAlumni()).toEqual([{ id: "one", name: "합성 수료생",
    title: null, quote: "합성 인용", imageUrl: null }]);
});

it("저장소 장애를 빈 슬라이드 목록으로 위장하지 않는다", async () => {
  const failure = new Error("synthetic database failure");
  mocks.listFeaturedAlumniRows.mockRejectedValueOnce(failure);
  await expect(listFeaturedAlumni()).rejects.toBe(failure);
});
