/**
 * 본문 편집기의 브라우저 직접 업로드 경로와 파일 시그니처 계약입니다 (#102).
 * 붙여넣기 파일에 이름이나 MIME이 없어도 실제 시작 바이트로 형식을 결정합니다.
 */
import { hasGalleryImageSignature, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";

export { maxGalleryImageBytes as maxEditorImageBytes };

export type EditorImageExtension = "jpg" | "png" | "webp" | "gif";
export const editorImageContentTypes: Record<EditorImageExtension, string> = {
  jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
};

export function editorImageType(bytes: Uint8Array): EditorImageExtension | null {
  for (const extension of ["jpg", "png", "webp", "gif"] as const) {
    if (hasGalleryImageSignature(bytes, extension)) return extension;
  }
  return null;
}

export function editorImagePath(uploadId: string, extension: EditorImageExtension): string {
  return `editor-images/${uploadId}.${extension}`;
}
