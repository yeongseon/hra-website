/**
 * 갤러리 이미지 직접 업로드의 브라우저·서버 공통 계약입니다 (#102).
 * 파일명은 저장 경로에서 제외하고 앨범·사용자·업로드 UUID로 대상을 고정합니다.
 */
export const maxGalleryImageBytes = 10 * 1024 * 1024;

type GalleryImageType = "jpg" | "png" | "webp" | "gif";

const imageTypes: Record<string, { extension: GalleryImageType; contentType: string }> = {
  jpg: { extension: "jpg", contentType: "image/jpeg" },
  jpeg: { extension: "jpg", contentType: "image/jpeg" },
  png: { extension: "png", contentType: "image/png" },
  webp: { extension: "webp", contentType: "image/webp" },
  gif: { extension: "gif", contentType: "image/gif" },
};

export function galleryImageRule(fileName: string, contentType: string) {
  if (!fileName || fileName.length > 255 || /[\x00-\x1f\x7f/\\]/.test(fileName)) return null;
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  const rule = imageTypes[extension];
  return rule && contentType.toLowerCase() === rule.contentType ? rule : null;
}

export function galleryUploadPath(galleryId: string, userId: string, uploadId: string, extension: GalleryImageType) {
  return `gallery-uploads/${galleryId}/${userId}/${uploadId}.${extension}`;
}

/** 선언된 이미지 형식과 실제 파일 헤더가 일치하는지 확인합니다. */
export function hasGalleryImageSignature(bytes: Uint8Array, extension: GalleryImageType): boolean {
  const begins = (prefix: number[]) => prefix.every((byte, index) => bytes[index] === byte);
  switch (extension) {
    case "jpg": return begins([0xff, 0xd8, 0xff]);
    case "png": return begins([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "gif": return begins([0x47, 0x49, 0x46, 0x38]) &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
    case "webp": return begins([0x52, 0x49, 0x46, 0x46]) &&
      [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte);
  }
}
