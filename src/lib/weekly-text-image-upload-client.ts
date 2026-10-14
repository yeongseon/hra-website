/** 관리자 주차별 텍스트 사진을 브라우저에서 직접 전송합니다 (#102). */
import { upload } from "@vercel/blob/client";
import { galleryImageRule, maxGalleryImageBytes } from "@/lib/gallery-upload-contract";
import { weeklyTextImagePath } from "@/lib/weekly-text-image-upload-contract";

export async function prepareWeeklyTextImages(formData: FormData, requestId: string, userId: string): Promise<{ formData: FormData } | { error: string }> {
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File && entry.size > 0);
  if (files.length === 0) {
    formData.delete("images");
    return { formData };
  }
  if (files.length > 100) return { error: "사진은 한 번에 100장 이하로 업로드해주세요." };
  const checked = files.map((file) => ({ file, rule: galleryImageRule(file.name, file.type) }));
  if (checked.some(({ file, rule }) => !rule || file.size > maxGalleryImageBytes)) {
    return { error: "사진은 10MB 이하의 JPG, PNG, WEBP, GIF 파일만 업로드할 수 있습니다." };
  }
  const results = await Promise.allSettled(checked.map(async ({ file, rule }) => {
    if (!rule) throw new Error("사진 형식이 올바르지 않습니다.");
    const uploadId = crypto.randomUUID();
    const blob = await upload(weeklyTextImagePath(requestId, userId, uploadId, rule.extension), file, {
      access: "public", handleUploadUrl: "/api/weekly-text-image-uploads", contentType: rule.contentType,
      multipart: file.size > 5 * 1024 * 1024,
      clientPayload: JSON.stringify({ requestId, uploadId, fileName: file.name, size: file.size, contentType: file.type }),
    });
    return blob.url;
  }));
  if (results.some((result) => result.status === "rejected")) return { error: "사진 업로드에 실패했습니다. 다시 시도해주세요." };
  formData.delete("images");
  formData.set("uploadedImageUrls", JSON.stringify(results.map((result) => result.status === "fulfilled" ? result.value : "")));
  return { formData };
}
