/** 수료생 이야기 사진의 브라우저 직접 업로드 경로와 허용 범위입니다 (#102). */
import { galleryImageRule } from "@/lib/gallery-upload-contract";

export const maxAlumniImageBytes = 5 * 1024 * 1024;
export type AlumniImageExtension = "jpg" | "png" | "webp";

export function alumniImageRule(fileName: string, contentType: string) {
  const rule = galleryImageRule(fileName, contentType);
  if (!rule || rule.extension === "gif") return null;
  return { extension: rule.extension, contentType: rule.contentType };
}

export function alumniUploadPath(storyId: string, userId: string, uploadId: string, extension: AlumniImageExtension) {
  return `alumni-uploads/${storyId}/${userId}/${uploadId}.${extension}`;
}
