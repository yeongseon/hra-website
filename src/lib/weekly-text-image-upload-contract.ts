/** 주차별 텍스트 사진의 브라우저·서버 공통 경로입니다 (#102). */
export type ImageExtension = "jpg" | "png" | "webp" | "gif";

export function weeklyTextImagePath(requestId: string, userId: string, uploadId: string, extension: ImageExtension): string {
  return `weekly-text-images/${requestId}/${userId}/${uploadId}.${extension}`;
}
