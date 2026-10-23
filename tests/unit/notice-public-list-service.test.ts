/**
 * 공지 목록 서비스가 Web 문자열과 API 숫자 페이지를 같은 공개 조회 규칙으로 처리합니다.
 * 숫자 입력이 조용히 1페이지로 돌아가거나 초안 조회로 바뀌지 않도록 검증합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  countNotices: vi.fn(),
  listNotices: vi.fn(),
}));

vi.mock("@/features/notices/public-list/repository", () => repository);

import { listPublishedNotices } from "@/features/notices/public-list/service";

beforeEach(() => {
  vi.resetAllMocks();
  repository.countNotices.mockResolvedValue(31);
  repository.listNotices.mockResolvedValue([]);
});

it("숫자 2페이지도 게시된 공지의 두 번째 15건을 조회한다", async () => {
  const result = await listPublishedNotices({ query: "  모집  ", page: 2 });

  expect(repository.countNotices).toHaveBeenCalledWith("PUBLISHED", "모집");
  expect(repository.listNotices).toHaveBeenCalledWith("PUBLISHED", "모집", 15, 15);
  expect(result).toEqual({
    items: [], totalCount: 31, currentPage: 2, totalPages: 3, startIndex: 15,
  });
});
