/** 교수 프로필 사진을 브라우저에서 Blob으로 직접 전송합니다 (#102). */
import { upload } from "@vercel/blob/client";
import { facultyImageRule, facultyUploadPath, maxFacultyImageBytes } from "@/lib/faculty-upload-contract";

export async function prepareFacultyUpload(formData: FormData, targetId: string, userId: string): Promise<{ formData: FormData } | { error: string }> {
  const entry = formData.get("image");
  if (!(entry instanceof File) || entry.size === 0) {
    formData.delete("image");
    return { formData };
  }
  const rule = facultyImageRule(entry.name, entry.type);
  if (!rule || entry.size > maxFacultyImageBytes) return { error: "프로필 사진은 5MB 이하의 JPG, PNG, WEBP 파일만 업로드할 수 있습니다." };

  try {
    const uploadId = crypto.randomUUID();
    const blob = await upload(facultyUploadPath(targetId, userId, uploadId, rule.extension), entry, {
      access: "public",
      handleUploadUrl: "/api/faculty-uploads",
      contentType: rule.contentType,
      multipart: entry.size > 4 * 1024 * 1024,
      clientPayload: JSON.stringify({ targetId, uploadId, fileName: entry.name, size: entry.size, contentType: entry.type }),
    });
    formData.delete("image");
    formData.set("uploadedImageUrl", blob.url);
    formData.set("uploadTargetId", targetId);
    return { formData };
  } catch {
    // 토큰 발급 후 저장이 실패한 파일은 소유권 원장의 미참조 정리 작업에 맡깁니다.
    return { error: "프로필 사진 업로드에 실패했습니다. 다시 시도해주세요." };
  }
}
