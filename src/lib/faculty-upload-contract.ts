/** 교수 프로필 사진의 브라우저 직접 업로드 경로와 허용 범위입니다 (#102). */
import { galleryImageRule } from "@/lib/gallery-upload-contract";

export const maxFacultyImageBytes = 5 * 1024 * 1024;
export type FacultyImageExtension = "jpg" | "png" | "webp";

export function facultyImageRule(fileName: string, contentType: string) {
  const rule = galleryImageRule(fileName, contentType);
  if (!rule || rule.extension === "gif") return null;
  return { extension: rule.extension, contentType: rule.contentType };
}

export function facultyUploadPath(targetId: string, userId: string, uploadId: string, extension: FacultyImageExtension) {
  return `faculty-uploads/${targetId}/${userId}/${uploadId}.${extension}`;
}
