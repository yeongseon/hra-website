/**
 * 수료생 상세 service의 엄격 ID 거부·조회 순서·표시 필드 재투영을 검증합니다.
 * 저장소 mock이 내부 본문이나 관리 열을 더해도 이웃·사이드바로 전달하면 실패합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  findAlumniStoryById: vi.fn(),
  findPreviousAlumniStory: vi.fn(),
  findNextAlumniStory: vi.fn(),
  listAlumniSidebarStories: vi.fn(),
}));
vi.mock("@/features/alumni/detail/repository", () => repository);

import { getPublicAlumniDetail } from "@/features/alumni/detail/service";

const id = "80000000-0000-4000-8000-000000000001";
const createdAt = new Date("2026-10-24T09:00:00.000Z");
const story = {
  id,
  name: "합성 수료생",
  title: "합성 직함",
  quote: "합성 인용",
  content: "공개 본문",
  imageUrl: null,
  order: 3,
  createdAt,
};

beforeEach(() => vi.resetAllMocks());

it("기존 Web의 엄격 UUID 정책을 통과하지 못하면 저장소를 호출하지 않는다", async () => {
  expect(await getPublicAlumniDetail("bad-id")).toBeNull();
  expect(await getPublicAlumniDetail("11111111-1111-1111-1111-111111111111")).toBeNull();
  expect(Object.values(repository).every((mock) => !mock.mock.calls.length)).toBe(true);
});

it("없는 상세는 이웃과 사이드바를 조회하지 않는다", async () => {
  repository.findAlumniStoryById.mockResolvedValue(null);
  expect(await getPublicAlumniDetail(id)).toBeNull();
  expect(repository.findPreviousAlumniStory).not.toHaveBeenCalled();
  expect(repository.findNextAlumniStory).not.toHaveBeenCalled();
  expect(repository.listAlumniSidebarStories).not.toHaveBeenCalled();
});

it("현재 tuple 기준 이웃과 사이드바에서 내부 열을 제거한다", async () => {
  repository.findAlumniStoryById.mockResolvedValue({ ...story, pinned: true, viewCount: 19 });
  repository.findPreviousAlumniStory.mockResolvedValue({ id: "80000000-0000-4000-8000-000000000002", name: "이전", content: "내부" });
  repository.findNextAlumniStory.mockResolvedValue({ id: "80000000-0000-4000-8000-000000000003", name: "다음", content: "내부" });
  repository.listAlumniSidebarStories.mockResolvedValue([{
    id, name: "합성 수료생", title: "합성 직함", summary: "짧은 요약", imageUrl: null,
    content: "사이드바 비공개 본문", pinned: true,
  }]);

  const result = await getPublicAlumniDetail(id);
  expect(result).toEqual({
    story,
    prevStory: { id: "80000000-0000-4000-8000-000000000002", name: "이전" },
    nextStory: { id: "80000000-0000-4000-8000-000000000003", name: "다음" },
    sidebarStories: [{ id, name: "합성 수료생", title: "합성 직함", summary: "짧은 요약", imageUrl: null }],
  });
  expect(repository.findPreviousAlumniStory).toHaveBeenCalledWith(3, createdAt);
  expect(repository.findNextAlumniStory).toHaveBeenCalledWith(3, createdAt);
  expect(JSON.stringify(result)).not.toMatch(/사이드바 비공개 본문|"pinned"|"viewCount"/);
});
