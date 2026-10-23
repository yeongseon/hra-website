/**
 * 갤러리 상세의 UUID 입력과 공개 표시 필드를 적용하는 Application Service입니다.
 * Page·메타데이터는 같은 읽기를 사용하고 조회수는 응답 후 별도 호출합니다.
 */
import "server-only";

import { z } from "zod/v4";
import { findGalleryDetailById, incrementGalleryViewCount, type PublicGalleryDetailRow } from "./repository";

export type PublicGalleryDetail = PublicGalleryDetailRow;

/** 잘못된 UUID는 DB 전에 거부하고 저장소의 추가 열은 표시 결과에서 제거합니다. */
export async function getPublicGalleryDetail(id: string): Promise<PublicGalleryDetail | null> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return null;

  const row = await findGalleryDetailById(parsed.data);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    viewCount: row.viewCount,
    images: row.images.map((image) => ({ id: image.id, url: image.url, alt: image.alt })),
  };
}

/** 이미 조회한 유효한 앨범의 요청별 조회수를 원자적으로 증가시킵니다. */
export async function incrementPublicGalleryViewCount(id: string): Promise<void> {
  const parsed = z.uuid().safeParse(id);
  if (!parsed.success) return;
  await incrementGalleryViewCount(parsed.data);
}
