/** 갤러리 사진을 브라우저에서 Blob으로 직접 전송하고 URL만 서버 액션에 전달합니다 (#102). */
import { upload } from "@vercel/blob/client";
import { galleryImageRule, galleryUploadPath, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";

export async function prepareGalleryUploads(formData: FormData, galleryId: string, userId: string): Promise<{ formData: FormData } | { error: string }> {
  const files = formData.getAll("images");
  if (files.length === 0) return { error: "이미지 파일을 선택해주세요." };
  if (files.length > 100) return { error: "이미지는 한 번에 100장 이하로 업로드해주세요." };
  type Checked = { file: File; rule: NonNullable<ReturnType<typeof galleryImageRule>> } | { error: string };
  const validated: Checked[] = files.map((entry, index) => {
    if (!(entry instanceof File) || entry.size === 0) return { error: `${index + 1}번째 파일을 확인해주세요.` };
    if (entry.size > maxGalleryImageBytes) return { error: `${entry.name}: 이미지 파일은 10MB 이하여야 합니다.` };
    const rule = galleryImageRule(entry.name, entry.type);
    return rule ? { file: entry, rule } : { error: `${entry.name}: JPG, PNG, WEBP, GIF 파일만 업로드할 수 있습니다.` };
  });
  const invalid = validated.find((item) => "error" in item);
  if (invalid && "error" in invalid) return { error: invalid.error };

  // 업로드가 일부 실패해도 이미 성공한 파일은 원장에 남아 정리 작업에서 처리됩니다.
  const results = await Promise.allSettled(validated.map(async (item) => {
    if ("error" in item) throw new Error("파일을 확인할 수 없습니다.");
    const uploadId = crypto.randomUUID();
    const pathname = galleryUploadPath(galleryId, userId, uploadId, item.rule.extension);
    const blob = await upload(pathname, item.file, {
      access: "public", handleUploadUrl: "/api/gallery-uploads", contentType: item.rule.contentType,
      multipart: item.file.size > 5 * 1024 * 1024,
      clientPayload: JSON.stringify({ galleryId, uploadId, fileName: item.file.name, size: item.file.size, contentType: item.file.type }),
    });
    return blob.url;
  }));
  if (results.some((result) => result.status === "rejected")) return { error: "이미지 업로드 중 오류가 발생했습니다. 다시 시도해주세요." };
  formData.delete("images");
  formData.set("uploadedImageUrls", JSON.stringify(results.map((result) => result.status === "fulfilled" ? result.value : "")));
  return { formData };
}
