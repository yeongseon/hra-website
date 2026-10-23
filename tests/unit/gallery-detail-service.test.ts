/**
 * 갤러리 상세 Service의 UUID 차단·공개 필드 투영·조회수 위임을 검증합니다.
 * 저장소의 커버·감사 열과 사진 내부 순서 열은 상세 Page에 전달하지 않습니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn(), increment: vi.fn() }));
vi.mock("@/features/gallery/detail/repository", () => ({
  findGalleryDetailById: mocks.find,
  incrementGalleryViewCount: mocks.increment,
}));

import { getPublicGalleryDetail, incrementPublicGalleryViewCount } from "@/features/gallery/detail/service";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => vi.resetAllMocks());

it("잘못된 UUID는 조회·증가 모두 DB 전에 차단한다", async () => {
  expect(await getPublicGalleryDetail("bad-id")).toBeNull();
  await incrementPublicGalleryViewCount("bad-id");
  expect(mocks.find).not.toHaveBeenCalled();
  expect(mocks.increment).not.toHaveBeenCalled();
});

it("저장소의 추가 열이 있어도 앨범과 사진 표시 필드만 남긴다", async () => {
  mocks.find.mockResolvedValue({ id, title: "합성 앨범", description: "공개 설명", viewCount: 4,
    coverImageUrl: "private://cover", createdAt: new Date(),
    images: [{ id: "a", url: "https://public.invalid/a.jpg", alt: null,
      order: 2, createdAt: new Date(), internalMemo: "비공개" }] });
  expect(await getPublicGalleryDetail(id)).toEqual({ id, title: "합성 앨범",
    description: "공개 설명", viewCount: 4,
    images: [{ id: "a", url: "https://public.invalid/a.jpg", alt: null }] });
  expect(mocks.find).toHaveBeenCalledExactlyOnceWith(id);
});

it("없는 앨범은 null이고 유효한 ID의 조회수는 저장소에 위임한다", async () => {
  mocks.find.mockResolvedValue(null);
  expect(await getPublicGalleryDetail(id)).toBeNull();
  await incrementPublicGalleryViewCount(id);
  expect(mocks.increment).toHaveBeenCalledExactlyOnceWith(id);
});

it("저장소 장애를 없는 앨범으로 위장하지 않는다", async () => {
  const failure = new Error("synthetic database failure");
  mocks.find.mockRejectedValueOnce(failure);
  await expect(getPublicGalleryDetail(id)).rejects.toBe(failure);
});
