/** 실물 private Blob QA에만 사용하는 고정 비민감 PDF 바이트와 해시입니다. */
import { createHash } from "node:crypto";

export function resourceQaPdfBytes() {
  // 객체 위치와 xref를 계산해 PDF 뷰어에서도 열리는 최소 한 페이지 파일을 만듭니다.
  const stream = "BT /F1 14 Tf 40 100 Td (HRA resource access QA only - no personal data) Tj ET\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 450 150] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  ];
  let content = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(content));
    content += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(content);
  content += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  content += offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  content += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(content);
}

export function resourceQaPdfSha256() {
  return createHash("sha256").update(resourceQaPdfBytes()).digest("hex");
}
