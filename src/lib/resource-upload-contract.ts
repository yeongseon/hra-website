/**
 * 강의 자료·가이드북 직접 업로드의 공통 계약입니다 (#102).
 * 브라우저와 서버가 같은 확장자·MIME·용량·경로 규칙을 사용합니다.
 */
export type ResourceUploadKind = "class-materials" | "guidebooks";

type UploadRule = {
  contentType: string;
  acceptedTypes: readonly string[];
  signature: "pdf" | "compound" | "zip";
};

const rules: Record<string, UploadRule> = {
  pdf: { contentType: "application/pdf", acceptedTypes: ["application/pdf"], signature: "pdf" },
  hwp: { contentType: "application/x-hwp", acceptedTypes: ["application/x-hwp", "application/vnd.hancom.hwp"], signature: "compound" },
  doc: { contentType: "application/msword", acceptedTypes: ["application/msword"], signature: "compound" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", acceptedTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], signature: "zip" },
  ppt: { contentType: "application/vnd.ms-powerpoint", acceptedTypes: ["application/vnd.ms-powerpoint"], signature: "compound" },
  pptx: { contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", acceptedTypes: ["application/vnd.openxmlformats-officedocument.presentationml.presentation"], signature: "zip" },
};

export const maxResourceUploadBytes: Record<ResourceUploadKind, number> = {
  "class-materials": 50 * 1024 * 1024,
  guidebooks: 30 * 1024 * 1024,
};

export function isResourceUploadKind(value: unknown): value is ResourceUploadKind {
  return value === "class-materials" || value === "guidebooks";
}

/** Blob 경로에 사용자 원본 파일명을 직접 넣지 않고 안전한 ASCII 이름만 사용합니다. */
export function resourceUploadFileName(fileName: string): string {
  const cleaned = fileName.trim().replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");
  return cleaned.startsWith(".") ? `document${cleaned}` : cleaned;
}

export function resourceUploadRule(kind: ResourceUploadKind, fileName: string): UploadRule | null {
  if (fileName.length < 1 || fileName.length > 255 || /[\x00-\x1f\x7f/\\]/.test(fileName)) return null;
  const extension = fileName.split(".").at(-1)?.toLowerCase() ?? "";
  if (kind === "guidebooks" && (extension === "ppt" || extension === "pptx")) return null;
  return rules[extension] ?? null;
}

export function resourceUploadPath(kind: ResourceUploadKind, userId: string, uploadId: string, fileName: string): string {
  return `resource-uploads/${kind}/${userId}/${uploadId}/${resourceUploadFileName(fileName)}`;
}

export function hasResourceSignature(bytes: Uint8Array, rule: UploadRule): boolean {
  const begins = (prefix: readonly number[]) => prefix.every((byte, index) => bytes[index] === byte);
  switch (rule.signature) {
    case "pdf": return begins([0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "compound": return begins([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "zip": return begins([0x50, 0x4b, 0x03, 0x04]);
  }
}
