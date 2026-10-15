/**
 * 자료실 파일 다운로드에 사용할 URL과 응답 파일명을 검증합니다.
 * DB 값도 신뢰하지 않고 이 프로젝트의 Blob 저장소만 서버에서 읽습니다.
 */
import { projectBlobHost } from "@/lib/blob-host";

export function isProjectBlobUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === projectBlobHost &&
      url.username === "" && url.password === "" && url.pathname !== "/" &&
      url.search === "" && url.hash === "";
  } catch {
    return false;
  }
}

/** 자료실 이전 기간에는 기존 공개 저장소와 지정된 비공개 저장소만 읽습니다. */
export function resourceBlobAccess(value: string): "public" | "private" | null {
  if (isProjectBlobUrl(value)) return "public";
  const privateHost = process.env.RESOURCE_PRIVATE_BLOB_HOST;
  if (!privateHost || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(privateHost)) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === privateHost &&
      url.username === "" && url.password === "" && url.pathname !== "/" &&
      url.search === "" && url.hash === "" ? "private" : null;
  } catch {
    return null;
  }
}

export function attachmentDisposition(fileName: string | null, inline = false): string {
  // 줄바꿈·경로 구분자·따옴표를 제거하여 헤더 삽입과 경로처럼 보이는 이름을 막습니다.
  const safeName = (fileName || "첨부파일")
    .replace(/[\x00-\x1f\x7f/\\"]/g, "_")
    .trim() || "첨부파일";
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`;
}
