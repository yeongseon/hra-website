/**
 * 본문에서 유래한 파일 삭제 API 재도입 방지 테스트 (#88).
 * 운영 Blob을 호출하지 않고 삭제 경로의 정적 경계를 검사합니다.
 * 등록된 첨부파일 정리와 본문 URL 정리는 별개이며, 소유권 모델 도입 전에는 후자를 금지합니다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("본문 파일 삭제 경계", () => {
  it.each(["notices", "class-logs", "weekly-texts"])("%s는 본문 URL을 추출해 삭제하지 않음", (feature) => {
    const source = readFileSync(`src/features/${feature}/actions/index.ts`, "utf8");
    expect(source).not.toContain("extractMarkdownBlobUrls");
    expect(source).not.toContain("deleteMarkdownBlobImages");
    expect(source).not.toMatch(/deleteBlobIfExists\([^)]*\.(?:content|body)\b/);
  });

  it("유틸은 신뢰하지 않은 본문 전체 삭제 API를 노출하지 않음", () => {
    const source = readFileSync("src/lib/blob-utils.ts", "utf8");
    expect(source).not.toContain("export async function deleteMarkdownBlobImages");
    expect(source).not.toContain("export function extractMarkdownBlobUrls");
    expect(source).toContain("export async function deleteBlobIfExists");
  });
});
