/** 모집 포스터의 브라우저 직접 업로드 경로와 허용 범위입니다 (#102). */
import { galleryImageRule } from "@/lib/gallery-upload-contract";

export const maxPosterImageBytes = 10 * 1024 * 1024;
/** 모집 설정은 단일 행이므로 고정 대상 UUID로 다른 직접 업로드와 경로를 분리합니다. */
export const posterUploadTargetId = "00000000-0000-4000-8000-000000000001";
export type PosterImageExtension = "jpg" | "png" | "webp" | "gif";

export function posterImageRule(fileName: string, contentType: string) {
  const rule = galleryImageRule(fileName, contentType);
  return rule;
}

export function posterUploadPath(posterId: string, userId: string, uploadId: string, extension: PosterImageExtension) {
  return `poster-uploads/${posterId}/${userId}/${uploadId}.${extension}`;
}
