/**
 * 갤러리 저장 직전에 직접 업로드 URL의 실물·소유자·형식을 검증합니다 (#102).
 * 브라우저가 보낸 URL과 Blob 메타데이터를 모두 재검증한 뒤 원장에 남깁니다.
 */
import { head } from "@vercel/blob";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";
import { galleryUploadPath, hasGalleryImageSignature, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const extensionTypes = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" } as const;
type Extension = keyof typeof extensionTypes;

export async function validateGalleryUploadReference(galleryId: string, userId: string, url: string): Promise<boolean> {
  if (!isProjectBlobUrl(url)) return false;
  const pathname = new URL(url).pathname.slice(1);
  const segments = pathname.split("/");
  const match = /^([0-9a-f-]+)\.(jpg|png|webp|gif)$/.exec(segments[3] ?? "");
  if (segments.length !== 4 || !match || !uuid.test(match[1]) || !uuid.test(galleryId) || !uuid.test(userId)) return false;
  const extension = match[2] as Extension;
  if (pathname !== galleryUploadPath(galleryId, userId, match[1], extension)) return false;

  try {
    const blob = await head(url);
    if (blob.url !== url || blob.pathname !== pathname || blob.size < 1 || blob.size > maxGalleryImageBytes ||
        blob.contentType !== extensionTypes[extension]) return false;
    // 큰 파일 전체를 함수로 가져오지 않도록 스트림 앞 12바이트만 읽습니다.
    const response = await fetch(url, { headers: { Range: "bytes=0-11" }, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!response.ok || !response.body) return false;
    const reader = response.body.getReader();
    const bytes = new Uint8Array(12);
    let count = 0;
    try {
      while (count < bytes.length) {
        const part = await reader.read();
        if (part.done) break;
        const length = Math.min(part.value.length, bytes.length - count);
        bytes.set(part.value.subarray(0, length), count);
        count += length;
      }
    } finally {
      await reader.cancel();
    }
    if (!hasGalleryImageSignature(bytes.subarray(0, count), extension)) return false;
    await recordResourceUpload(url, userId);
    return true;
  } catch {
    return false;
  }
}
