/**
 * Markdown Frontmatter 검증 스키마 (이슈 #16)
 *
 * 역할: 보고서/가이드/템플릿 Markdown 파일의 Frontmatter 메타데이터를
 *       zod/v4 기반으로 검증한다. 필수 필드가 누락되면 빌드 또는
 *       렌더링 전에 오류를 감지하여 보고서 목록·PDF 파일명·권한 처리·
 *       필터링 기능이 깨지는 것을 방지한다.
 *
 * 사용 위치:
 *   - src/lib/markdown/parse.ts (parseMarkdown 함수에서 자동 호출)
 *   - src/lib/markdown/__tests__/schema.test.ts (단위 테스트)
 *
 * 관련 이슈:
 *   - #7 보고서 양식 3종 — report 스키마 사용
 *   - #8 가이드 3종 — guide 스키마 사용
 *   - #10 렌더링 유틸 — parse 단계에서 자동 검증
 *   - #12 관리자 화면 — DB 저장 전 검증
 */

import { z } from "zod/v4";

// 보고서 카테고리 (HWP 양식 3종에 대응)
// - management-book: 경영서 보고서
// - classic-book: 고전명작 보고서
// - business-practice: 기업실무/한국경제사 보고서
export const reportCategorySchema = z.enum([
  "management-book",
  "classic-book",
  "business-practice",
]);

// 공개 범위 (이슈 #18 아카이브 범위 설계와 연결)
// - public: 비회원 포함 모두 열람 가능 (우수 보고서 등)
// - member: 로그인 회원만 열람 가능 (양식·가이드·일반 보고서)
// - admin: 관리자만 열람 가능 (검토 전 보고서)
export const visibilitySchema = z.enum(["public", "member", "admin"]);

// SemVer 형식의 버전 문자열 검증
// 예: "1.0.0", "2.3.1"
const semverSchema = z
  .string()
  .regex(
    /^\d+\.\d+\.\d+$/,
    "버전은 SemVer 형식(예: 1.0.0)이어야 합니다.",
  );

// 날짜 문자열 검증 (YYYY-MM-DD)
// 예: "2026-04-26"
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다.");

// ============================================================
// Report Frontmatter (보고서)
// ============================================================

// 학생이 제출하는 보고서의 Frontmatter
// 필수 필드가 모두 있어야 발표 정보 표·PDF 파일명·필터링이 가능하다.
export const reportFrontmatterSchema = z.object({
  title: z.string().trim().min(1, "title 필드가 필요합니다."),
  generation: z.string().trim().min(1, "generation 필드가 필요합니다."),
  team: z.string().trim().min(1, "team 필드가 필요합니다."),
  category: reportCategorySchema,
  presenter: z.string().trim().min(1, "presenter 필드가 필요합니다."),
  members: z.array(z.string().trim().min(1)).min(1, "members 배열이 비어있습니다."),
  professor: z.string().trim().min(1, "professor 필드가 필요합니다."),
  presentationDate: isoDateSchema,
  visibility: visibilitySchema,
  version: semverSchema,
  tags: z.array(z.string().trim()).default([]),
});

export type ReportFrontmatter = z.infer<typeof reportFrontmatterSchema>;

// ============================================================
// Guide Frontmatter (보고서 작성 가이드)
// ============================================================

// 회원에게 제공되는 가이드 문서 (작성 가이드, Markdown 가이드, 제출 안내)
export const guideFrontmatterSchema = z.object({
  title: z.string().trim().min(1, "title 필드가 필요합니다."),
  category: z.literal("guide"),
  visibility: visibilitySchema,
  version: semverSchema,
  // description은 카드 UI에서 사용하므로 선택 필드로 둔다
  description: z.string().trim().optional(),
  // updatedAt은 표시용이므로 선택 필드 (없으면 파일 mtime 사용)
  updatedAt: isoDateSchema.optional(),
});

export type GuideFrontmatter = z.infer<typeof guideFrontmatterSchema>;

// ============================================================
// Template Frontmatter (보고서 양식)
// ============================================================

// 학생이 보고서 작성 시 참고하는 양식
// (#7에서 추가한 management-book / classic-book / business-practice 템플릿)
export const templateFrontmatterSchema = z.object({
  title: z.string().trim().min(1, "title 필드가 필요합니다."),
  category: z.literal("template"),
  // 어떤 보고서 양식인지 (PDF 파일명 규칙에 사용)
  reportCategory: reportCategorySchema,
  visibility: visibilitySchema,
  version: semverSchema,
  description: z.string().trim().optional(),
  updatedAt: isoDateSchema.optional(),
});

export type TemplateFrontmatter = z.infer<typeof templateFrontmatterSchema>;

// ============================================================
// 통합 검증 헬퍼
// ============================================================

// 종류별 스키마 매핑 — parseMarkdown에서 사용
export const frontmatterSchemas = {
  report: reportFrontmatterSchema,
  guide: guideFrontmatterSchema,
  template: templateFrontmatterSchema,
} as const;

export type FrontmatterKind = keyof typeof frontmatterSchemas;
