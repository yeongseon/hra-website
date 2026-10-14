/** 수료생 이야기 사진을 브라우저에서 Blob으로 직접 전송합니다 (#102). */
import { upload } from "@vercel/blob/client";
import { alumniImageRule, alumniUploadPath, maxAlumniImageBytes } from "@/lib/alumni-upload-contract";

export async function prepareAlumniUploads(formData: FormData, storyId: string, userId: string): Promise<{ formData: FormData } | { error: string }> {
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    formData.delete("images");
    return { formData };
  }
  if (files.length > 100) return { error: "사진은 한 번에 100장 이하로 업로드해주세요." };
  const checked = files.map((file) => ({ file, rule: alumniImageRule(file.name, file.type) }));
  if (checked.some(({ file, rule }) => !rule || file.size > maxAlumniImageBytes)) {
    return { error: "사진은 5MB 이하의 JPG, PNG, WEBP 파일만 업로드할 수 있습니다." };
  }

  // 일부 전송이 실패해도 성공한 Blob은 소유권 원장에 남아 미참조 파일 정리 대상이 됩니다.
  const results = await Promise.allSettled(checked.map(async ({ file, rule }) => {
    if (!rule) throw new Error("사진 형식이 올바르지 않습니다.");
    const uploadId = crypto.randomUUID();
    const blob = await upload(alumniUploadPath(storyId, userId, uploadId, rule.extension), file, {
      access: "public",
      handleUploadUrl: "/api/alumni-uploads",
      contentType: rule.contentType,
      multipart: file.size > 4 * 1024 * 1024,
      clientPayload: JSON.stringify({ storyId, uploadId, fileName: file.name, size: file.size, contentType: file.type }),
    });
    return blob.url;
  }));
  if (results.some((result) => result.status === "rejected")) return { error: "사진 업로드에 실패했습니다. 다시 시도해주세요." };
  formData.delete("images");
  formData.set("uploadedImageUrls", JSON.stringify(results.map((result) => result.status === "fulfilled" ? result.value : "")));
  return { formData };
}
