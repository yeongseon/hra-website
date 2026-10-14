/** 모집 포스터 원본을 브라우저에서 Blob으로 직접 전송합니다 (#102). */
import { upload } from "@vercel/blob/client";
import { maxPosterImageBytes, posterImageRule, posterUploadPath, posterUploadTargetId } from "@/lib/poster-upload-contract";

export async function preparePosterUpload(formData: FormData, userId: string): Promise<{ formData: FormData } | { error: string }> {
  const entry = formData.get("posterFile");
  if (formData.get("removePoster") === "true" || !(entry instanceof File) || entry.size === 0) {
    formData.delete("posterFile");
    return { formData };
  }
  const rule = posterImageRule(entry.name, entry.type);
  if (!rule || entry.size > maxPosterImageBytes) return { error: "포스터는 10MB 이하의 JPG, PNG, WEBP, GIF 파일만 업로드할 수 있습니다." };

  try {
    const uploadId = crypto.randomUUID();
    const blob = await upload(posterUploadPath(posterUploadTargetId, userId, uploadId, rule.extension), entry, {
      access: "public", handleUploadUrl: "/api/poster-uploads", contentType: rule.contentType,
      multipart: entry.size > 5 * 1024 * 1024,
      clientPayload: JSON.stringify({ posterId: posterUploadTargetId, uploadId, fileName: entry.name, size: entry.size, contentType: entry.type }),
    });
    formData.delete("posterFile");
    formData.set("uploadedPosterUrl", blob.url);
    return { formData };
  } catch {
    // 토큰 발급 후 남은 미참조 Blob은 원장 정리 작업에서 처리합니다.
    return { error: "포스터 업로드에 실패했습니다. 다시 시도해주세요." };
  }
}
