/**
 * 편집기에 삽입할 완료 URL을 Blob 실물·소유권·이미지 헤더로 확인합니다 (#102).
 * 검증 실패 파일은 원장에 남겨 미참조 정리 대상이 되도록 합니다.
 */
import { head } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { markdownImageAssets } from "@/lib/db/schema";
import { editorImageContentTypes, editorImagePath, editorImageType, maxEditorImageBytes, type EditorImageExtension } from "@/lib/editor-image-upload-contract";
import { isProjectBlobUrl } from "@/lib/resource-download";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function validateEditorImageReference(userId: string, url: string): Promise<boolean> {
  if (!isProjectBlobUrl(url) || !uuid.test(userId)) return false;
  const pathname = new URL(url).pathname.slice(1);
  const segments = pathname.split("/");
  const match = /^([0-9a-f-]+)\.(jpg|png|webp|gif)$/.exec(segments[1] ?? "");
  if (segments.length !== 2 || !match || !uuid.test(match[1])) return false;
  const extension = match[2] as EditorImageExtension;
  if (pathname !== editorImagePath(match[1], extension)) return false;
  try {
    const blob = await head(url);
    if (blob.url !== url || blob.pathname !== pathname || blob.size < 1 ||
        blob.size > maxEditorImageBytes || blob.contentType !== editorImageContentTypes[extension]) return false;
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
    if (editorImageType(bytes.subarray(0, count)) !== extension) return false;
    const asset = await db.query.markdownImageAssets.findFirst({ where: eq(markdownImageAssets.url, url) });
    return asset?.uploadedById === userId && asset.deletedAt === null;
  } catch {
    return false;
  }
}
