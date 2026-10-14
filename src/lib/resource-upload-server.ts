/**
 * 직접 업로드된 자료를 저장하기 직전에 재검증합니다 (#102).
 * 브라우저가 보낸 URL·파일명·MIME은 신뢰하지 않고 이 저장소의 Blob 메타데이터와
 * 실제 시작 바이트를 확인합니다. 소유권 원장은 취소·저장 실패 파일의 정리에 사용합니다.
 */
import { head } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { markdownImageAssets } from "@/lib/db/schema";
import { isProjectBlobUrl } from "@/lib/resource-download";
import {
  hasResourceSignature,
  maxResourceUploadBytes,
  resourceUploadPath,
  resourceUploadRule,
  type ResourceUploadKind,
} from "@/lib/resource-upload-contract";

const uploadIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 충돌 시 기존 소유자를 확인하며 다른 사람의 URL을 재등록하지 않습니다. */
export async function recordResourceUpload(url: string, userId: string): Promise<void> {
  await db.insert(markdownImageAssets).values({ url, uploadedById: userId }).onConflictDoNothing();
  const asset = await db.query.markdownImageAssets.findFirst({ where: eq(markdownImageAssets.url, url) });
  if (!asset || asset.uploadedById !== userId || asset.deletedAt !== null) {
    throw new Error("업로드 소유권을 확인할 수 없습니다.");
  }
}

async function readBlobHeader(url: string): Promise<Uint8Array> {
  // Range가 무시되더라도 12바이트만 읽고 스트림을 취소하여 함수가 대용량 파일을
  // 전부 내려받지 않도록 합니다. URL은 호출 전에 프로젝트 Blob 호스트로 제한합니다.
  const response = await fetch(url, {
    headers: { Range: "bytes=0-11" },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !response.body) throw new Error("업로드 파일을 읽을 수 없습니다.");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(12);
  let length = 0;
  try {
    while (length < bytes.length) {
      const result = await reader.read();
      if (result.done) break;
      const copied = Math.min(result.value.length, bytes.length - length);
      bytes.set(result.value.subarray(0, copied), length);
      length += copied;
    }
  } finally {
    await reader.cancel();
  }
  return bytes.subarray(0, length);
}

export async function validateResourceUploadReference(
  kind: ResourceUploadKind,
  userId: string,
  url: string,
  fileName: string,
): Promise<{ url: string; fileName: string } | { error: string }> {
  const rule = resourceUploadRule(kind, fileName);
  if (!rule || !isProjectBlobUrl(url)) return { error: "업로드한 파일 정보를 확인할 수 없습니다." };

  const pathname = new URL(url).pathname.slice(1);
  const segments = pathname.split("/");
  const uploadId = segments[3];
  if (segments.length !== 5 || !uploadId || !uploadIdPattern.test(uploadId) ||
      pathname !== resourceUploadPath(kind, userId, uploadId, fileName)) {
    return { error: "업로드한 파일의 소유자를 확인할 수 없습니다." };
  }

  try {
    const blob = await head(url);
    if (blob.url !== url || blob.pathname !== pathname || blob.size < 1 ||
        blob.size > maxResourceUploadBytes[kind] || blob.contentType !== rule.contentType) {
      return { error: "업로드한 파일의 종류나 크기가 허용 범위를 벗어났습니다." };
    }
    if (!hasResourceSignature(await readBlobHeader(url), rule)) {
      return { error: "파일 내용과 형식이 일치하지 않습니다." };
    }
    await recordResourceUpload(url, userId);
    return { url, fileName };
  } catch {
    return { error: "업로드한 파일을 확인할 수 없습니다. 다시 업로드해주세요." };
  }
}
