/**
 * Vercel Blob 삭제 공통 유틸.
 * 도메인 검사는 소유권 검사가 아닙니다. 호출자는 서버가 확인한 업로드 URL만 전달해야 합니다.
 * 본문 URL을 삭제하는 API는 제공하지 않습니다 (#88).
 */

import { del } from "@vercel/blob";
import { logServerError, redactBlobUrl } from "@/lib/errors";

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
 *
 * PII 정책 (#70):
 *   - error: sanitizeError 로 감싼다 (Vercel Blob SDK 는 실패 시 응답 body 를 message 에 담을 수 있음)
 *   - url: raw 로 로그하면 사용자 지정 파일명 (예: "홍길동-프로필.jpg") 이 노출되므로
 *     redactBlobUrl 로 host + 첫 path segment 만 남긴다. 어느 feature (alumni/gallery 등)
 *     의 Blob 삭제가 실패했는지 debug 하기에 충분하다.
 */
async function safelyDeleteBlobUrl(url: string): Promise<void> {
  try {
    await del(url);
  } catch (error) {
    logServerError("blob-utils/delete", error, { blobUrl: redactBlobUrl(url) });
  }
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
