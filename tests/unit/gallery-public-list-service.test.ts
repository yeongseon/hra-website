/**
 * 갤러리 목록 Service가 사진 ID 배열을 개수로 바꾸고 공개 카드 필드만 반환하는지 확인합니다.
 * 저장소 행의 설명·감사 시각·개별 사진 URL은 화면으로 넘어가지 않습니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listGalleryAlbumRows: vi.fn() }));
vi.mock("@/features/gallery/public-list/repository", () => ({ listGalleryAlbumRows: mocks.listGalleryAlbumRows }));

import { listPublicGalleryAlbums } from "@/features/gallery/public-list/service";

beforeEach(() => vi.resetAllMocks());

it("사진 ID 두 건은 수 2로 바꾸고 카드 다섯 필드만 남긴다", async () => {
  mocks.listGalleryAlbumRows.mockResolvedValue([{ id: "one", title: "합성 앨범",
    coverImageUrl: "https://public.invalid/cover.jpg", viewCount: 7,
    createdAt: new Date(), description: "내부 설명", updatedAt: new Date(),
    images: [{ id: "a", url: "private://image-a" }, { id: "b", url: "private://image-b" }] }]);
  expect(await listPublicGalleryAlbums()).toEqual([{ id: "one", title: "합성 앨범",
    coverImageUrl: "https://public.invalid/cover.jpg", viewCount: 7, imageCount: 2 }]);
});

it("저장소 장애를 빈 앨범 목록으로 위장하지 않는다", async () => {
  const failure = new Error("synthetic database failure");
  mocks.listGalleryAlbumRows.mockRejectedValueOnce(failure);
  await expect(listPublicGalleryAlbums()).rejects.toBe(failure);
});
