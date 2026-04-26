/**
 * Markdown Frontmatter 검증 스키마 단위 테스트 (이슈 #16)
 *
 * 검증 대상:
 *   - report 스키마: 필수 필드 누락 시 한국어 오류 메시지
 *   - guide / template 스키마: visibility, version 형식 검증
 */
import { describe, expect, it } from "vitest";
import {
  guideFrontmatterSchema,
  reportFrontmatterSchema,
  templateFrontmatterSchema,
} from "@/lib/markdown/schema";

describe("reportFrontmatterSchema", () => {
  const valid = {
    title: "삼성전자 분석",
    generation: "5기",
    team: "1조",
    category: "management-book" as const,
    presenter: "홍길동",
    members: ["홍길동", "이몽룡"],
    professor: "김교수",
    presentationDate: "2026-04-26",
    visibility: "member" as const,
    version: "1.0.0",
    tags: ["반도체"],
  };

  it("정상 입력은 통과한다", () => {
    expect(reportFrontmatterSchema.safeParse(valid).success).toBe(true);
  });

  it("title 누락 시 한국어 오류를 반환한다", () => {
    const result = reportFrontmatterSchema.safeParse({ ...valid, title: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toContain("title");
    }
  });

  it("presentationDate가 ISO 형식이 아니면 거부한다", () => {
    const result = reportFrontmatterSchema.safeParse({
      ...valid,
      presentationDate: "2026/04/26",
    });
    expect(result.success).toBe(false);
  });

  it("version이 SemVer가 아니면 거부한다", () => {
    const result = reportFrontmatterSchema.safeParse({
      ...valid,
      version: "v1",
    });
    expect(result.success).toBe(false);
  });

  it("members 배열이 비어있으면 거부한다", () => {
    const result = reportFrontmatterSchema.safeParse({ ...valid, members: [] });
    expect(result.success).toBe(false);
  });
});

describe("guideFrontmatterSchema", () => {
  it("category=guide만 허용한다", () => {
    const result = guideFrontmatterSchema.safeParse({
      title: "보고서 작성 가이드",
      category: "template",
      visibility: "member",
      version: "1.0.0",
    });
    expect(result.success).toBe(false);
  });

  it("정상 입력은 통과한다", () => {
    const result = guideFrontmatterSchema.safeParse({
      title: "보고서 작성 가이드",
      category: "guide",
      visibility: "member",
      version: "1.0.0",
    });
    expect(result.success).toBe(true);
  });
});

describe("templateFrontmatterSchema", () => {
  it("reportCategory가 빠지면 거부한다", () => {
    const result = templateFrontmatterSchema.safeParse({
      title: "경영서 보고서 양식",
      category: "template",
      visibility: "member",
      version: "1.0.0",
    });
    expect(result.success).toBe(false);
  });

  it("정상 입력은 통과한다", () => {
    const result = templateFrontmatterSchema.safeParse({
      title: "경영서 보고서 양식",
      category: "template",
      reportCategory: "management-book",
      visibility: "member",
      version: "1.0.0",
    });
    expect(result.success).toBe(true);
  });
});
