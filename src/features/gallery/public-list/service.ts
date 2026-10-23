/**
 * 공개 갤러리 앨범의 표시 필드를 Page에 전달하는 Application Service입니다.
 * 사진 ID 배열은 개수로 바꾸고 내부 설명·감사 열은 화면 경계에서 제외합니다.
 */
import "server-only";

import { listGalleryAlbumRows } from "./repository";

export type PublicGalleryAlbum = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  viewCount: number;
  imageCount: number;
};

/** 앨범 카드에 필요한 다섯 필드만 새 객체로 투영합니다. */
export async function listPublicGalleryAlbums(): Promise<PublicGalleryAlbum[]> {
  const rows = await listGalleryAlbumRows();
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    coverImageUrl: row.coverImageUrl,
    viewCount: row.viewCount,
    imageCount: row.images.length,
  }));
}
