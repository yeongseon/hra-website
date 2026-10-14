/**
 * 수업일지·주차별 텍스트 이미지 설명의 DB 길이 경계를 확인합니다 (#90).
 * 제목은 최대 300자를 허용하지만 이미지 alt 컬럼은 255자입니다.
 */
import { describe, expect, it } from "vitest";
import { buildImageAlt } from "@/lib/image-alt";

describe("자동 이미지 설명", () => {
  it.each([250, 251, 300])("한글 %i자 제목을 255자 이내로 저장한다", (length) => {
    const title = "가".repeat(length);
    const alt = buildImageAlt(title, 1);

    expect(alt).toBe(`${title.slice(0, 250)} 사진 1`);
    expect(Array.from(alt)).toHaveLength(255);
  });

  it.each([9, 10, 100])("이미지 번호 %i의 자릿수까지 길이에 포함한다", (number) => {
    const alt = buildImageAlt("나".repeat(300), number);

    expect(alt).toBe(`${"나".repeat(255 - Array.from(` 사진 ${number}`).length)} 사진 ${number}`);
    expect(Array.from(alt)).toHaveLength(255);
  });

  it("짧은 제목은 그대로 유지하고, 이모지를 중간에서 자르지 않는다", () => {
    expect(buildImageAlt("짧은 제목", 2)).toBe("짧은 제목 사진 2");

    const alt = buildImageAlt(`${"다".repeat(249)}😀끝`, 1);
    expect(alt).toBe(`${"다".repeat(249)}😀 사진 1`);
    expect(alt).not.toContain("�");
    expect(Array.from(alt)).toHaveLength(255);
  });
});
