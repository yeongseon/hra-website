/**
 * Markdown 파싱 + Frontmatter 검증 유틸 (이슈 #10, #16)
 *
 * 역할: gray-matter로 Markdown 본문에서 Frontmatter를 분리하고,
 *       zod 스키마로 메타데이터를 검증한다. 검증 실패 시 한국어 오류 메시지를
 *       반환하여 빌드 또는 렌더링 전에 잘못된 메타데이터를 차단한다.
 *
 * 사용 위치:
 *   - src/lib/markdown/read-from-content.ts (파일 시스템 기반 reader)
 *   - src/features/report-templates/actions/index.ts (DB 저장 전 검증)
 */

import matter from "gray-matter";
import {
  frontmatterSchemas,
  type FrontmatterKind,
  type GuideFrontmatter,
  type ReportFrontmatter,
  type TemplateFrontmatter,
} from "@/lib/markdown/schema";

export type ParsedMarkdown<TFrontmatter> = {
  frontmatter: TFrontmatter;
  body: string;
};

export type ParseResult<TFrontmatter> =
  | { ok: true; data: ParsedMarkdown<TFrontmatter> }
  | { ok: false; error: string };

// 종류별 정확한 타입 추론을 위한 오버로드 시그니처
export function parseMarkdown(
  raw: string,
  kind: "report",
): ParseResult<ReportFrontmatter>;
export function parseMarkdown(
  raw: string,
  kind: "guide",
): ParseResult<GuideFrontmatter>;
export function parseMarkdown(
  raw: string,
  kind: "template",
): ParseResult<TemplateFrontmatter>;
export function parseMarkdown(
  raw: string,
  kind: FrontmatterKind,
): ParseResult<ReportFrontmatter | GuideFrontmatter | TemplateFrontmatter> {
  let parsed: matter.GrayMatterFile<string>;
  try {
    parsed = matter(raw);
  } catch (error) {
    return {
      ok: false,
      error: `Frontmatter 파싱 실패: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const schema = frontmatterSchemas[kind];
  const result = schema.safeParse(parsed.data);

  if (!result.success) {
    // 가장 명확한 오류 한 건만 보여준다 (관리자가 수정하기 쉽도록)
    const firstIssue = result.error.issues[0];
    const path = firstIssue?.path.join(".") ?? "";
    const message = firstIssue?.message ?? "Frontmatter 검증 실패";
    return {
      ok: false,
      error: path ? `[${path}] ${message}` : message,
    };
  }

  return {
    ok: true,
    data: {
      frontmatter: result.data,
      body: parsed.content,
    },
  };
}
