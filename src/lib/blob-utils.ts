/**
 * Vercel Blob 삭제 공통 유틸.
 * 외부 URL 오삭제를 막기 위해 Blob 도메인만 선별한다.
 */

import { del } from "@vercel/blob";

/**
 * 삭제 대상이 Blob 저장소 URL인지 판별한다.
 * 외부 이미지 URL에 del()을 호출하지 않기 위한 보안 가드다.
 *
 * hostname을 파싱하여 vercel-storage.com 계열 도메인인지 엄격하게 검사한다.
 * 이전의 url.includes() 방식은 외부 URL에 해당 문자열이 우연히 포함될 경우
 * 오인식할 수 있어 hostname 기반 검사로 교체한다.
 */
export function isBlobUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    // *.vercel-storage.com 또는 *.public.blob.vercel-storage.com 허용
    return hostname.endsWith(".vercel-storage.com");
  } catch {
    // URL 파싱 실패 → 안전하게 false 반환
    return false;
  }
}

/**
 * Blob 삭제 실패를 로그로 남기고 다음 정리 작업을 계속한다.
 */
async function safelyDeleteBlobUrl(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    console.error("[blob-utils/delete] Blob 삭제 오류:", { url, error });
  }
}

/**
 * 마크다운 이미지 문법을 정규식으로 스캔해 Blob URL만 추출한다.
 */
export function extractMarkdownBlobUrls(markdown: string): string[] {
  const regex = /!\[.*?\]\((https?:\/\/[^)]+)\)/g;
  const urls = new Set<string>();

  let match: RegExpExecArray | null = regex.exec(markdown);

  while (match !== null) {
    const url = match[1];

    if (isBlobUrl(url)) {
      urls.add(url);
    }

    match = regex.exec(markdown);
  }

  return [...urls];
}

/**
 * 마크다운 본문 안에 임베드된 Blob 이미지를 모두 삭제한다.
 */
export async function deleteMarkdownBlobImages(markdown: string): Promise<void> {
  const urls = extractMarkdownBlobUrls(markdown);

  if (urls.length === 0) {
    return;
  }

  await Promise.all(urls.map((url) => safelyDeleteBlobUrl(url)));
}

/**
 * 단일 URL이 실제 Blob URL일 때만 삭제한다.
 */
export async function deleteBlobIfExists(url: string | null | undefined): Promise<void> {
  if (!url || !isBlobUrl(url)) {
    return;
  }

  await safelyDeleteBlobUrl(url);
}
