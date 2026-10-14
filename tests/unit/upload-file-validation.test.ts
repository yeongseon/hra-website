/**
 * 업로드 파일의 선언 타입, 확장자, 시작 바이트를 함께 검증합니다 (#131).
 */
import { describe, expect, it } from "vitest";
import { validateDocumentUpload, validateImageUpload } from "@/lib/upload-file-validation";

const compound = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("문서 업로드 검증", () => {
  it("내용이 PDF인 파일은 서버가 PDF 타입을 결정한다", async () => {
    expect(await validateDocumentUpload(new File(["%PDF-1.7"], "자료.pdf", { type: "application/pdf" })))
      .toBe("application/pdf");
  });

  it("브라우저가 타입을 비워 보낸 HWP도 확장자와 바이트가 맞으면 허용한다", async () => {
    expect(await validateDocumentUpload(new File([compound], "회의록.hwp")))
      .toBe("application/x-hwp");
  });

  it("선언 타입 또는 확장자를 속여도 내용이 다르면 거절한다", async () => {
    expect(await validateDocumentUpload(new File(["<html>"], "자료.pdf", { type: "application/pdf" }))).toBeNull();
    expect(await validateDocumentUpload(new File(["%PDF-1.7"], "자료.exe", { type: "application/pdf" }))).toBeNull();
    expect(await validateDocumentUpload(new File(["%PDF-1.7"], "자료.pdf", { type: "text/html" }))).toBeNull();
    expect(await validateDocumentUpload(new File([compound], "자료.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).toBeNull();
  });

  it("DOC와 DOCX의 컨테이너 시그니처를 구분한다", async () => {
    expect(await validateDocumentUpload(new File([compound], "자료.doc", { type: "application/msword" }))).toBe("application/msword");
    expect(await validateDocumentUpload(new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], "자료.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })))
      .toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  });
});

describe("사진 업로드 검증", () => {
  it("PNG 시그니처와 확장자가 맞아야 허용한다", async () => {
    expect(await validateImageUpload(new File([png], "사진.png", { type: "image/png" }))).toBe("image/png");
    expect(await validateImageUpload(new File(["not-png"], "사진.png", { type: "image/png" }))).toBeNull();
    expect(await validateImageUpload(new File([png], "사진.jpg", { type: "image/jpeg" }))).toBeNull();
    expect(await validateImageUpload(new File([png], "사진.png", { type: "text/html" }))).toBeNull();
  });

  it("JPEG·GIF·WebP도 파일 시작 바이트로 확인한다", async () => {
    expect(await validateImageUpload(new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpeg", { type: "image/jpeg" }))).toBe("image/jpeg");
    expect(await validateImageUpload(new File(["GIF89a"], "a.gif", { type: "image/gif" }))).toBe("image/gif");
    expect(await validateImageUpload(new File(["RIFF0000WEBP"], "a.webp", { type: "image/webp" }))).toBe("image/webp");
  });
});
