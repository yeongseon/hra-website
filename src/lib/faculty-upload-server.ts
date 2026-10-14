/** 저장 전 교수 프로필 사진 URL의 경로·Blob 메타·실제 이미지 형식·소유권을 검증합니다 (#102). */
import { head } from "@vercel/blob";
import { facultyUploadPath, maxFacultyImageBytes, type FacultyImageExtension } from "@/lib/faculty-upload-contract";
import { hasGalleryImageSignature } from "@/lib/gallery-upload-contract";
import { isProjectBlobUrl } from "@/lib/resource-download";
import { recordResourceUpload } from "@/lib/resource-upload-server";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contentTypes: Record<FacultyImageExtension, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };

export async function validateFacultyImageReference(targetId: string, userId: string, url: string): Promise<boolean> {
  if (!isProjectBlobUrl(url) || !uuid.test(targetId) || !uuid.test(userId)) return false;
  const pathname = new URL(url).pathname.slice(1);
  const segments = pathname.split("/");
  const match = /^([0-9a-f-]+)\.(jpg|png|webp)$/.exec(segments[3] ?? "");
  if (segments.length !== 4 || !match || !uuid.test(match[1])) return false;
  const extension = match[2] as FacultyImageExtension;
  if (pathname !== facultyUploadPath(targetId, userId, match[1], extension)) return false;

  try {
    const blob = await head(url);
    if (blob.url !== url || blob.pathname !== pathname || blob.size < 1 ||
        blob.size > maxFacultyImageBytes || blob.contentType !== contentTypes[extension]) return false;
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
