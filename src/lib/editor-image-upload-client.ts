/** 편집기 이미지를 직접 전송하고 서버 검증이 끝난 URL만 반환합니다 (#102). */
import { upload } from "@vercel/blob/client";
import { editorImageContentTypes, editorImagePath, editorImageType, maxEditorImageBytes } from "@/lib/editor-image-upload-contract";

export async function uploadEditorImage(file: File): Promise<string> {
  if (file.size < 1 || file.size > maxEditorImageBytes) throw new Error("이미지 크기는 10MB 이하여야 합니다.");
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const extension = editorImageType(header);
  if (!extension) throw new Error("JPG, PNG, WEBP, GIF 이미지만 업로드할 수 있습니다.");
  const uploadId = crypto.randomUUID();
  try {
    const blob = await upload(editorImagePath(uploadId, extension), file, {
      access: "public", handleUploadUrl: "/api/editor-image-uploads",
      contentType: editorImageContentTypes[extension], multipart: file.size > 5 * 1024 * 1024,
      clientPayload: JSON.stringify({ uploadId, extension, size: file.size }),
    });
    const response = await fetch("/api/editor-image-uploads", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "editor.verify", url: blob.url }),
    });
    if (!response.ok) throw new Error("이미지 파일을 확인할 수 없습니다.");
    const result: { url?: string } = await response.json();
    if (result.url !== blob.url) throw new Error("이미지 파일을 확인할 수 없습니다.");
    return blob.url;
  } catch {
    throw new Error("이미지 업로드에 실패했습니다. 다시 시도해주세요.");
  }
}
