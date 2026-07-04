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
import yaml from "js-yaml";
import { logServerError } from "@/lib/errors";
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
    // gray-matter는 YAML Date(예: 2026-04-26)를 JS Date 객체로 자동 변환하는데,
    // Zod 스키마는 문자열("YYYY-MM-DD")을 기대하므로 engines 옵션으로
    // Date 자동 변환을 비활성화한다.
    parsed = matter(raw, {
      engines: {
        yaml: (str: string) =>
          yaml.load(str, { schema: yaml.JSON_SCHEMA }) as Record<string, unknown>,
      },
    });
  } catch (error) {
    // gray-matter/js-yaml 원본 예외는 파싱 실패한 소스 스니펫을 그대로 인용할 수 있어,
    // 편집자 실수로 frontmatter 값에 넣은 이메일·전화번호·이름 등 일반 텍스트 PII 가
    // 상위 호출자(read-from-content.ts) 의 throw 를 통해 에러 바운더리에서 렌더링될 수 있다.
    // redactMessage 는 SQL·경로 위주라 자유 텍스트 PII 를 걸러내지 못하므로, 반환값은
    // 일반화하고 디버깅용 원본은 서버 로그(Vercel Logs)에만 남긴다.
    logServerError("markdown/parse", error, { kind });
    return {
      ok: false,
      error: "Frontmatter 파싱 실패: 파일 형식을 확인해주세요.",
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
