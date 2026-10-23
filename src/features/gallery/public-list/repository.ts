/**
 * 공개 갤러리 앨범 목록의 PostgreSQL 관계 조회를 소유합니다.
 * 작성일 역순과 이미지 ID 관계만 읽어 기존 사진 수 계산을 유지합니다.
 */
import "server-only";

import { desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { galleries } from "@/lib/db/schema";

export type PublicGalleryAlbumRow = {
  id: string;
  title: string;
  coverImageUrl: string | null;
  viewCount: number;
  createdAt: Date;
  images: { id: string }[];
};

/** 공개 카드 필드와 사진 수에 필요한 ID만 작성일 역순으로 읽습니다. */
export async function listGalleryAlbumRows(): Promise<PublicGalleryAlbumRow[]> {
  return db.query.galleries.findMany({
    columns: {
      id: true,
      title: true,
      coverImageUrl: true,
      viewCount: true,
      createdAt: true,
    },
    orderBy: [desc(galleries.createdAt)],
    with: { images: { columns: { id: true } } },
  });
}
