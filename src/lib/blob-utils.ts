/**
 * Vercel Blob 삭제 공통 유틸.
 * 도메인 검사는 소유권 검사가 아닙니다. 호출자는 서버가 확인한 업로드 URL만 전달해야 합니다.
 * 본문 URL을 삭제하는 API는 제공하지 않습니다 (#88).
 */

import { del } from "@vercel/blob";
import { logServerError } from "@/lib/errors";
import { resourceBlobAccess } from "@/lib/resource-download";

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
 * 로그에는 고정 scope와 검증된 오류 분류만 남긴다.
 * Blob SDK 응답과 사용자 지정 파일명을 포함할 수 있는 URL은 전달하지 않는다.
 */
async function safelyDeleteBlobUrl(url: string): Promise<void> {
  try {
    const access = resourceBlobAccess(url);
    if (new URL(url).hostname.endsWith(".private.blob.vercel-storage.com")) {
      // 비공개 자료는 설정된 정확한 저장소와 토큰이 일치할 때만 삭제합니다.
      if (access !== "private" || !process.env.RESOURCE_PRIVATE_READ_WRITE_TOKEN) {
        throw new Error("비공개 자료 저장소 삭제 설정이 없습니다.");
      }
      await del(url, { token: process.env.RESOURCE_PRIVATE_READ_WRITE_TOKEN });
    } else {
      await del(url);
    }
  } catch (error) {
    logServerError("blob-utils/delete", error);
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
