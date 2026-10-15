/**
 * 보호 자료의 업로드 저장소를 선택합니다.
 * 비공개 전환 플래그가 켜진 뒤에는 설정 누락 시 공개 저장소로 되돌아가지 않습니다.
 */
import { projectBlobHost } from "@/lib/blob-host";
import { resourceBlobAccess } from "@/lib/resource-download";

type ResourceBlobStore =
  | { access: "public"; host: string; token?: undefined; storeId?: undefined }
  | { access: "private"; host: string; token: string; storeId: string };

export function resourceUploadStore(): ResourceBlobStore {
  if (process.env.RESOURCE_PRIVATE_BLOB_ENABLED !== "true") {
    return { access: "public", host: projectBlobHost };
  }

  const host = process.env.RESOURCE_PRIVATE_BLOB_HOST;
  const token = process.env.RESOURCE_PRIVATE_READ_WRITE_TOKEN;
  if (!host || !token || !/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host)) {
    throw new Error("비공개 자료 저장소 설정이 완전하지 않습니다.");
  }
  return { access: "private", host, token, storeId: host.split(".")[0] };
}

/** 새 보호 자료는 현재 쓰기 저장소의 URL만 DB에 등록합니다. */
export function isCurrentResourceUploadUrl(url: string): boolean {
  const store = resourceUploadStore();
  if (resourceBlobAccess(url) !== store.access) return false;
  return new URL(url).hostname === store.host;
}

/** 기존 공개 자료와 이전 완료된 비공개 자료를 모두 읽고 정리할 수 있게 합니다. */
export function resourceBlobToken(url: string): string | undefined {
  if (resourceBlobAccess(url) !== "private") return undefined;
  const token = process.env.RESOURCE_PRIVATE_READ_WRITE_TOKEN;
  if (!token) throw new Error("비공개 자료 저장소 토큰이 없습니다.");
  return token;
}
