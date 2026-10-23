// @vitest-environment node
/**
 * 공지 API 서비스는 게시 상태·요청 페이지·Markdown 발췌 정책을 고정합니다.
 * DB 본문은 응답 객체에 남기지 않고 범위 밖 페이지에서는 목록 조회를 생략합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { API_V1_MAX_PAGE_SIZE } from "@hra/contracts/api-v1";

const repository = vi.hoisted(() => ({ countNotices: vi.fn(), listNoticeApiRows: vi.fn() }));
vi.mock("@/features/notices/public-list/repository", () => repository);

import { listPublishedNoticesForApi } from "@/features/notices/public-list/service";

const id = "11111111-1111-4111-8111-111111111111";
const createdAt = new Date("2026-10-20T01:02:03.004Z");
const updatedAt = new Date("2026-10-21T05:06:07.008Z");

beforeEach(() => {
  vi.resetAllMocks();
  repository.countNotices.mockResolvedValue(1);
  repository.listNoticeApiRows.mockResolvedValue([{
    id, title: "합성 공지", content: "**굵은 내용** 뒤 문장", pinned: true,
    viewCount: 2, createdAt, updatedAt, authorId: "서버 내부 필드",
  }]);
});

it("발행된 공지만 한 번에 읽고 본문을 제거한 발췌 DTO를 만든다", async () => {
  const result = await listPublishedNoticesForApi({ query: "  모집  ", page: 1, pageSize: 10 });
  expect(repository.countNotices).toHaveBeenCalledWith("PUBLISHED", "모집");
  expect(repository.listNoticeApiRows).toHaveBeenCalledWith("PUBLISHED", "모집", 10, 0);
  expect(result).toEqual({
    totalCount: 1,
    items: [{ id, title: "합성 공지", excerpt: "굵은 내용 뒤 문장", pinned: true,
      viewCount: 2, createdAt, updatedAt }],
  });
});

it("범위를 지난 숫자 페이지는 마지막으로 보정하지 않고 빈 목록을 반환한다", async () => {
  const result = await listPublishedNoticesForApi({ query: "", page: 2, pageSize: 10 });
  expect(result).toEqual({ items: [], totalCount: 1 });
  expect(repository.listNoticeApiRows).not.toHaveBeenCalled();
});

it("안전한 OFFSET 범위를 넘는 입력은 DB 접속 전에 거부한다", async () => {
  await expect(listPublishedNoticesForApi({ query: "", page: Number.MAX_SAFE_INTEGER, pageSize: 50 }))
    .rejects.toThrow("NOTICE_API_INPUT_INVALID");
  expect(repository.countNotices).not.toHaveBeenCalled();
});

it("공용 계약의 최대 페이지 크기와 서비스 제한이 함께 움직인다", async () => {
  await listPublishedNoticesForApi({ query: "", page: 1, pageSize: API_V1_MAX_PAGE_SIZE });
  expect(repository.listNoticeApiRows).toHaveBeenCalledWith("PUBLISHED", "", API_V1_MAX_PAGE_SIZE, 0);

  repository.countNotices.mockClear();
  await expect(listPublishedNoticesForApi({ query: "", page: 1, pageSize: API_V1_MAX_PAGE_SIZE + 1 }))
    .rejects.toThrow("NOTICE_API_INPUT_INVALID");
  expect(repository.countNotices).not.toHaveBeenCalled();
});
