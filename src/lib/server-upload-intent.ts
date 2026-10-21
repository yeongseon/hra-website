/**
 * 서버 교체 업로드의 최종 URL을 객체 생성 전에 소유권 원장에 예약합니다 (#290).
 * 업로드·콘텐츠 쓰기 응답이 유실되어도 예약을 남겨 유지보수 정리가 현재 참조를 재확인합니다.
 */
import { put } from "@vercel/blob";
import { projectBlobHost } from "@/lib/blob-host";
import { resourceUploadStore } from "@/lib/resource-blob-store";
import { recordResourceUpload } from "@/lib/resource-upload-server";

type ServerUpload = {
  namespace: "weekly-texts" | "class-logs" | "recruitment" | "faculty" | "alumni" | "cohorts";
  extension: string;
  body: File | Buffer;
  contentType: string;
  uploadedById: string;
  protectedResource?: boolean;
};

/** 호출자는 실제 파일 검증을 먼저 수행하며, UUID 경로에는 원래 파일명을 넣지 않습니다. */
export async function uploadWithOwnedIntent(input: ServerUpload): Promise<string> {
  if (!/^[a-z0-9]{1,12}$/.test(input.extension)) throw new Error("파일 확장자가 올바르지 않습니다.");
  const store = input.protectedResource ? resourceUploadStore() : { host: projectBlobHost, access: "public" as const };
  const pathname = `${input.namespace}/${crypto.randomUUID()}.${input.extension}`;
  const expectedUrl = `https://${store.host}/${pathname}`;

  // 예약 응답이 실패하면 객체를 만들지 않습니다. 예약만 남아도 이후 정리할 수 있습니다.
  await recordResourceUpload(expectedUrl, input.uploadedById);
  const blob = await put(pathname, input.body, {
    access: store.access, contentType: input.contentType, addRandomSuffix: false, allowOverwrite: false,
    ...("token" in store && store.token ? { token: store.token } : {}),
  });
  // SDK 응답이 달라졌다면 콘텐츠에 연결하지 않으며 예약된 URL은 보존합니다.
  if (blob.url !== expectedUrl) throw new Error("업로드 저장 경로를 확인할 수 없습니다.");
  return expectedUrl;
}
