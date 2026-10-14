/** 주차별 텍스트 사진의 업로드 경로와 실물 검증을 공유합니다 (#102). */
import { head } from "@vercel/blob";
import { hasGalleryImageSignature, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";
import { weeklyTextImagePath, type ImageExtension } from "@/lib/weekly-text-image-upload-contract";

const contentTypes: Record<ImageExtension, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function validateWeeklyTextImageReference(requestId: string, userId: string, url: string): Promise<boolean> {
  if (!isProjectBlobUrl(url) || !uuid.test(requestId) || !uuid.test(userId)) return false;
  const pathname = new URL(url).pathname.slice(1);
  const segments = pathname.split("/");
  const match = /^([0-9a-f-]+)\.(jpg|png|webp|gif)$/.exec(segments[3] ?? "");
  if (segments.length !== 4 || !match || !uuid.test(match[1])) return false;
  const extension = match[2] as ImageExtension;
  if (pathname !== weeklyTextImagePath(requestId, userId, match[1], extension)) return false;
  try {
    const blob = await head(url);
    if (blob.url !== url || blob.pathname !== pathname || blob.size < 1 ||
        blob.size > maxGalleryImageBytes || blob.contentType !== contentTypes[extension]) return false;
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
