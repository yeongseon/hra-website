/**
 * 브라우저에서 자료실 문서를 Blob으로 직접 전송합니다 (#102).
 * Server Action에는 작은 텍스트 값과 완료 URL만 보내 Vercel 함수 본문 제한을 피합니다.
 */
import { upload } from "@vercel/blob/client";
import { resourceUploadAccess } from "@/lib/resource-upload-access-client";
import {
  maxResourceUploadBytes,
  resourceUploadPath,
  resourceUploadRule,
  type ResourceUploadKind,
} from "@/lib/resource-upload-contract";

export async function prepareResourceUpload(
  formData: FormData,
  kind: ResourceUploadKind,
  userId: string,
  required: boolean,
): Promise<{ formData: FormData } | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    if (required) return { error: "파일을 선택해주세요." };
    formData.delete("file");
    return { formData };
  }

  const rule = resourceUploadRule(kind, file.name);
  if (!rule || (file.type && !rule.acceptedTypes.includes(file.type.toLowerCase()))) {
    return { error: kind !== "class-materials"
      ? "PDF, HWP, DOC, DOCX 파일만 업로드할 수 있습니다."
      : "PDF, HWP, DOC, DOCX, PPT, PPTX 파일만 업로드할 수 있습니다." };
  }
  if (file.size > maxResourceUploadBytes[kind]) {
    return { error: kind === "class-materials" ? "파일 크기는 50MB 이하여야 합니다." : "파일 크기는 30MB 이하여야 합니다." };
  }

  const uploadId = crypto.randomUUID();
  const pathname = resourceUploadPath(kind, userId, uploadId, file.name);
  try {
    const access = await resourceUploadAccess("/api/resource-uploads");
    const blob = await upload(pathname, file, {
      access,
      handleUploadUrl: "/api/resource-uploads",
      contentType: rule.contentType,
      multipart: file.size > 5 * 1024 * 1024,
      clientPayload: JSON.stringify({ kind, fileName: file.name, size: file.size, contentType: file.type, uploadId }),
    });
    formData.delete("file");
    formData.set("uploadedFileUrl", blob.url);
    formData.set("uploadedFileName", file.name);
    return { formData };
  } catch {
    return { error: "파일 업로드에 실패했습니다. 다시 시도해주세요." };
  }
}
