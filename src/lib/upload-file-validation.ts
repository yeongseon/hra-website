/**
 * 자료실 업로드 파일의 확장자, 선언된 MIME, 실제 파일 시작 바이트를 함께 확인합니다.
 * 파일 전체를 읽지 않고 앞 12바이트만 읽으며, 저장 MIME은 서버가 결정합니다 (#131).
 */
type FileRule = { contentType: string; mimeTypes: readonly string[]; signature: "pdf" | "compound" | "zip" | "jpg" | "png" | "webp" | "gif" };

const documentRules: Record<string, FileRule> = {
  pdf: { contentType: "application/pdf", mimeTypes: ["application/pdf"], signature: "pdf" },
  hwp: { contentType: "application/x-hwp", mimeTypes: ["application/x-hwp", "application/vnd.hancom.hwp"], signature: "compound" },
  doc: { contentType: "application/msword", mimeTypes: ["application/msword"], signature: "compound" },
  docx: { contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], signature: "zip" },
};

const imageRules: Record<string, FileRule> = {
  jpg: { contentType: "image/jpeg", mimeTypes: ["image/jpeg"], signature: "jpg" },
  jpeg: { contentType: "image/jpeg", mimeTypes: ["image/jpeg"], signature: "jpg" },
  png: { contentType: "image/png", mimeTypes: ["image/png"], signature: "png" },
  webp: { contentType: "image/webp", mimeTypes: ["image/webp"], signature: "webp" },
  gif: { contentType: "image/gif", mimeTypes: ["image/gif"], signature: "gif" },
};

function hasSignature(bytes: Uint8Array, signature: FileRule["signature"]): boolean {
  const startsWith = (expected: number[]) => expected.every((byte, index) => bytes[index] === byte);
  switch (signature) {
    case "pdf": return startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]);
    case "compound": return startsWith([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
    case "zip": return startsWith([0x50, 0x4b, 0x03, 0x04]);
    case "jpg": return startsWith([0xff, 0xd8, 0xff]);
    case "png": return startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "webp": return startsWith([0x52, 0x49, 0x46, 0x46]) &&
      [0x57, 0x45, 0x42, 0x50].every((byte, index) => bytes[index + 8] === byte);
    case "gif": return startsWith([0x47, 0x49, 0x46, 0x38]) &&
      (bytes[4] === 0x37 || bytes[4] === 0x39) && bytes[5] === 0x61;
  }
}

async function validateFile(file: File, rules: Record<string, FileRule>): Promise<string | null> {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const rule = rules[extension];
  if (!rule || (file.type && !rule.mimeTypes.includes(file.type.toLowerCase()))) return null;
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  return hasSignature(bytes, rule.signature) ? rule.contentType : null;
}

export function validateDocumentUpload(file: File): Promise<string | null> {
  return validateFile(file, documentRules);
}

export function validateImageUpload(file: File): Promise<string | null> {
  return validateFile(file, imageRules);
}
