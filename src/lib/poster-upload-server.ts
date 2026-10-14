/** 저장 전 모집 포스터 URL의 경로·Blob 메타·실제 이미지 형식·소유권을 검증합니다 (#102). */
import { head, put } from "@vercel/blob";
import sharp from "sharp";
import { posterUploadPath, maxPosterImageBytes, posterUploadTargetId, type PosterImageExtension } from "@/lib/poster-upload-contract";
import { hasGalleryImageSignature } from "@/lib/gallery-upload-contract";
import { logServerError } from "@/lib/errors";
import { recordOwnedBlob } from "@/lib/owned-blob";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contentTypes: Record<PosterImageExtension, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function validatePosterImageReference(posterId: string, userId: string, url: string): Promise<boolean> {
  if (!isProjectBlobUrl(url) || !uuid.test(posterId) || !uuid.test(userId)) return false;
  const pathname = new URL(url).pathname.slice(1);
  const segments = pathname.split("/");
  const match = /^([0-9a-f-]+)\.(jpg|png|webp|gif)$/.exec(segments[3] ?? "");
  if (segments.length !== 4 || !match || !uuid.test(match[1])) return false;
  const extension = match[2] as PosterImageExtension;
  if (pathname !== posterUploadPath(posterId, userId, match[1], extension)) return false;

  try {
    const blob = await head(url);
    if (blob.url !== url || blob.pathname !== pathname || blob.size < 1 ||
        blob.size > maxPosterImageBytes || blob.contentType !== contentTypes[extension]) return false;
    // Range 응답이 무시되더라도 시작 12바이트만 읽고 스트림을 닫습니다.
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

/** 직접 업로드된 원본을 기존 서버 업로드와 동일한 품질의 WebP로 변환합니다. */
export async function prepareStoredPoster(url: string, userId: string): Promise<string> {
  if (!await validatePosterImageReference(posterUploadTargetId, userId, url)) {
    throw new Error("업로드한 포스터를 확인할 수 없습니다.");
  }
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error("업로드한 포스터를 읽을 수 없습니다.");
  const original = Buffer.from(await response.arrayBuffer());
  if (original.length < 1 || original.length > maxPosterImageBytes) throw new Error("포스터 크기를 확인할 수 없습니다.");

  let webp: Buffer;
  try {
    webp = await sharp(original).webp({ quality: 85 }).toBuffer();
  } catch (error) {
    // 기존 동작과 같이 변환 불가 파일은 검증된 원본을 사용합니다.
    logServerError("recruitment-settings/poster-convert", error);
    return url;
  }
  const blob = await put(`recruitment/포스터-${crypto.randomUUID()}.webp`, webp, {
    access: "public", contentType: "image/webp", addRandomSuffix: true,
  });
  await recordOwnedBlob(blob.url, userId);
  return blob.url;
}
