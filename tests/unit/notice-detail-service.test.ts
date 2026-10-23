/**
 * 공개 공지 상세 service의 입력 차단·필드 제한·이전/다음글 경계를 저장소 mock으로 검증합니다.
 * SQL 실행 없이 잘못된 ID가 저장소에 도달하지 않는지 확인합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  findPublishedNoticeById: vi.fn(),
  findPreviousPublishedNotice: vi.fn(),
  findNextPublishedNotice: vi.fn(),
  incrementNoticeViewCount: vi.fn(),
}));

vi.mock("@/features/notices/detail/repository", () => repository);

import {
  getPublishedNoticeById,
  getPublishedNoticeDetail,
  incrementPublishedNoticeViewCount,
} from "@/features/notices/detail/service";

const id = "11111111-1111-1111-1111-111111111111";
const createdAt = new Date("2026-10-23T09:00:00.000Z");
const notice = { id, title: "합성 공지", content: "합성 본문", viewCount: 7, createdAt };

beforeEach(() => vi.resetAllMocks());

it("형식이 잘못된 ID는 조회·갱신 전에 거부한다", async () => {
  expect(await getPublishedNoticeById("bad-id")).toBeNull();
  expect(await getPublishedNoticeDetail("bad-id")).toBeNull();
  await incrementPublishedNoticeViewCount("bad-id");
  expect(Object.values(repository).every((call) => !call.mock.calls.length)).toBe(true);
});

it("게시된 행이 없으면 이웃 조회를 하지 않고 null을 돌려준다", async () => {
  repository.findPublishedNoticeById.mockResolvedValue(null);
  expect(await getPublishedNoticeDetail(id)).toBeNull();
  expect(repository.findPublishedNoticeById).toHaveBeenCalledWith(id);
  expect(repository.findPreviousPublishedNotice).not.toHaveBeenCalled();
  expect(repository.findNextPublishedNotice).not.toHaveBeenCalled();
});

it("저장소의 내부 필드가 섞여도 공개 공지와 이웃 링크만 반환한다", async () => {
  repository.findPublishedNoticeById.mockResolvedValue({ ...notice, authorId: "내부 작성자", status: "PUBLISHED" });
  repository.findPreviousPublishedNotice.mockResolvedValue({ id: "22222222-2222-2222-2222-222222222222", title: "이전글", authorId: "내부" });
  repository.findNextPublishedNotice.mockResolvedValue({ id: "33333333-3333-3333-3333-333333333333", title: "다음글", authorId: "내부" });

  const result = await getPublishedNoticeDetail(id);
  expect(result).toEqual({
    notice,
    prevNotice: { id: "22222222-2222-2222-2222-222222222222", title: "이전글" },
    nextNotice: { id: "33333333-3333-3333-3333-333333333333", title: "다음글" },
  });
  expect(Object.keys(result?.notice ?? {})).toEqual(["id", "title", "content", "viewCount", "createdAt"]);
  expect(repository.findPreviousPublishedNotice).toHaveBeenCalledWith(createdAt);
  expect(repository.findNextPublishedNotice).toHaveBeenCalledWith(createdAt);
});

it("공유 UUID 계약이 허용하는 ID의 조회수 갱신만 저장소에 위임한다", async () => {
  await incrementPublishedNoticeViewCount(id);
  expect(repository.incrementNoticeViewCount).toHaveBeenCalledExactlyOnceWith(id);
});
