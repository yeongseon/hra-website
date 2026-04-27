/**
 * content/ 디렉토리 기반 Markdown reader (이슈 #10)
 *
 * 역할: content/member/templates/, content/member/guides/ 경로의
 *       정적 Markdown 파일을 읽어서 parseMarkdown으로 검증된 결과를 반환한다.
 *       서버 컴포넌트에서만 호출 가능 (Node fs API 사용).
 *
 * 사용 위치:
 *   - src/app/(member)/member/guides/[slug]/page.tsx
 *   - src/app/(member)/member/templates/page.tsx (목록)
 *   - src/app/(member)/member/templates/[slug]/page.tsx (DB 미존재 시 fallback)
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import { parseMarkdown, type ParsedMarkdown } from "@/lib/markdown/parse";
import type {
  GuideFrontmatter,
  TemplateFrontmatter,
} from "@/lib/markdown/schema";

// content/ 루트 (프로젝트 루트 기준)
const contentRoot = path.join(process.cwd(), "content");

// slug ↔ 파일명 매핑
// URL slug가 곧 파일 basename이 되도록 1:1로 정렬한다.
// 예) /member/guides/report-writing-guide → content/member/guides/report-writing-guide.md
const guideSlugToFileName: Record<string, string> = {
  "report-writing-guide": "report-writing-guide.md",
  "markdown-guide": "markdown-guide.md",
  "submission-guide": "submission-guide.md",
};

const templateSlugToFileName: Record<string, string> = {
  "management-book": "management-book-template.md",
  "classic-book": "classic-book-template.md",
  "business-practice": "business-practice-template.md",
};

export const guideSlugs = Object.keys(guideSlugToFileName);
export const templateSlugs = Object.keys(templateSlugToFileName);

async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch (error) {
    // ENOENT(파일 없음), ENOTDIR(경로 없음)는 호출 측에서 처리하도록 null 반환
    // content/ 폴더 자체가 없는 환경(Vercel 등)에서도 안전하게 동작
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      ["ENOENT", "ENOTDIR"].includes((error as { code: string }).code)
    ) {
      return null;
    }
    throw error;
  }
}

export async function readGuide(
  slug: string,
): Promise<ParsedMarkdown<GuideFrontmatter> | null> {
  const fileName = guideSlugToFileName[slug];
  if (!fileName) return null;

  const filePath = path.join(contentRoot, "member", "guides", fileName);
  const raw = await readFileSafe(filePath);
  if (raw === null) return null;

  const result = parseMarkdown(raw, "guide");
  if (!result.ok) {
    throw new Error(`가이드 파싱 실패 (${slug}): ${result.error}`);
  }
  return result.data;
}

export async function readTemplateFromContent(
  slug: string,
): Promise<ParsedMarkdown<TemplateFrontmatter> | null> {
  const fileName = templateSlugToFileName[slug];
  if (!fileName) return null;

  const filePath = path.join(contentRoot, "member", "templates", fileName);
  const raw = await readFileSafe(filePath);
  if (raw === null) return null;

  const result = parseMarkdown(raw, "template");
  if (!result.ok) {
    throw new Error(`템플릿 파싱 실패 (${slug}): ${result.error}`);
  }
  return result.data;
}

export async function listAllTemplatesFromContent(): Promise<
  Array<{ slug: string; data: ParsedMarkdown<TemplateFrontmatter> }>
> {
  const entries = await Promise.all(
    templateSlugs.map(async (slug) => {
      const data = await readTemplateFromContent(slug);
      return data ? { slug, data } : null;
    }),
  );
  return entries.filter((entry): entry is NonNullable<typeof entry> => entry !== null);
}
