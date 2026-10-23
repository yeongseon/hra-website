/**
 * 공개 갤러리 상세와 응답 후 조회수 갱신의 PostgreSQL 접근을 소유합니다.
 * 앨범·사진 표시 열만 읽고 관리자 지정 사진 순서를 유지합니다.
 */
import "server-only";

import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { galleries, galleryImages } from "@/lib/db/schema";

export type PublicGalleryDetailRow = {
  id: string;
  title: string;
  description: string | null;
  viewCount: number;
  images: { id: string; url: string; alt: string | null }[];
};

/** 한 앨범의 표시 필드와 관리자가 지정한 순서의 사진만 읽습니다. */
export async function findGalleryDetailById(id: string): Promise<PublicGalleryDetailRow | null> {
  const row = await db.query.galleries.findFirst({
    where: eq(galleries.id, id),
    columns: { id: true, title: true, description: true, viewCount: true },
    with: {
      images: {
        columns: { id: true, url: true, alt: true },
        orderBy: [asc(galleryImages.order), asc(galleryImages.createdAt)],
      },
    },
  });
  return row ?? null;
}

/** 응답 이후 현재 DB 조회수에 1을 더하는 단일 원자 UPDATE를 실행합니다. */
export async function incrementGalleryViewCount(id: string): Promise<void> {
  await db
    .update(galleries)
    .set({ viewCount: sql`${galleries.viewCount} + 1` })
    .where(eq(galleries.id, id));
}
