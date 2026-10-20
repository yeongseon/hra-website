/**
 * 관리자 서버 경유 이미지에 직접 업로드와 같은 파일 계약을 적용합니다.
 * 브라우저가 선언한 확장자·MIME과 실제 시작 바이트가 모두 일치해야 저장 정보를 반환합니다.
 */
import { hasGalleryImageSignature } from "@/lib/gallery-upload-contract";

type ImageRule = { extension: "jpg" | "png" | "webp" | "gif"; contentType: string };
export type ValidatedAdminImage = ImageRule & { file: File };

/** MIME이 비었거나 파일명이 잘못된 요청도 직접 업로드와 동일하게 거부합니다. */
export async function validateAdminImage(
  file: File,
  ruleFor: (fileName: string, contentType: string) => ImageRule | null,
): Promise<ValidatedAdminImage | null> {
  const rule = ruleFor(file.name, file.type);
  if (!rule) return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return hasGalleryImageSignature(bytes, rule.extension) ? { file, ...rule } : null;
}
