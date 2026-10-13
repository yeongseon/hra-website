/**
 * 서버가 새로 업로드한 Blob의 소유권을 DB 원장에 기록합니다 (#93).
 * 원장에 없는 기존 URL은 이 함수로 소급 등록하지 않습니다.
 * 콘텐츠 DB 쓰기에 실패하거나 결과가 불확실하면 원장 행을 남겨
 * 쓰기 중단 유지보수 시간에 현재 참조를 확인한 뒤 재시도 가능하게 정리합니다.
 */
import { db } from "@/lib/db";
import { markdownImageAssets } from "@/lib/db/schema";
import { deleteBlobIfExists } from "@/lib/blob-utils";

/** 업로드 직후, 콘텐츠 행을 쓰기 전에 호출합니다. */
export async function recordOwnedBlob(url: string, uploadedById?: string): Promise<void> {
  try {
    await db.insert(markdownImageAssets).values({
      url,
      uploadedById: uploadedById ?? null,
    });
  } catch (error) {
    // 콘텐츠 행을 아직 쓰지 않았으므로 이 요청에서 업로드한 파일만 되지웁니다.
    // DB 응답이 불확실해 원장 행이 남았다면 유지보수 정리가 다시 확인합니다.
    await deleteBlobIfExists(url);
    throw error;
  }
}
