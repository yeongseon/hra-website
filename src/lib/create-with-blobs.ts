/**
 * 게시글 생성 전에 Blob을 업로드하고, 실패한 요청의 파일을 정리합니다.
 * 병렬 업로드가 하나라도 실패하면 나머지 작업의 종료까지 기다려 늦게 성공한 파일도 수집합니다.
 * 소유권 원장은 삭제 실패 후 유지보수 정리 작업이 미참조 파일을 찾는 근거입니다.
 */
import { put } from "@vercel/blob";
import { deleteBlobIfExists } from "@/lib/blob-utils";
import { recordOwnedBlob } from "@/lib/owned-blob";
import { resourceUploadStore } from "@/lib/resource-blob-store";

type Upload = {
  pathname: string;
  file: File;
  contentType?: string;
};

/** 이 요청에서 성공한 업로드만 정리하며, 각 파일의 정리 실패는 공통 유틸에서 기록합니다. */
export async function cleanupCreatedBlobs(urls: string[]): Promise<void> {
  await Promise.all(urls.map((url) => deleteBlobIfExists(url)));
}

/** 모든 업로드 결과를 받은 뒤 실패 여부를 결정해 늦은 성공을 놓치지 않습니다. */
export async function uploadBlobsForCreate(
  uploads: Upload[],
  uploadedById?: string,
  protectedResource = false,
): Promise<string[]> {
  const store = protectedResource ? resourceUploadStore() : null;
  const results = await Promise.allSettled(
    uploads.map(async ({ pathname, file, contentType }) => {
      // 같은 요청 키로 재시도하거나 동시 제출해도 기존 파일을 덮어쓰지 않습니다.
      const blob = await put(pathname, file, {
        access: store?.access ?? "public", addRandomSuffix: true, contentType,
        ...(store?.token ? { token: store.token } : {}),
      });
      await recordOwnedBlob(blob.url, uploadedById);
      return blob.url;
    }),
  );
  const urls = results.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);

  if (results.some((result) => result.status === "rejected")) {
    await cleanupCreatedBlobs(urls);
    throw new Error("첨부 파일 업로드에 실패했습니다.");
  }

  return urls;
}
