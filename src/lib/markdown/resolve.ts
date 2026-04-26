/**
 * 보고서 양식·가이드 통합 리졸버
 *
 * 역할: 회원 페이지에서 사용할 양식/가이드 데이터를 DB → content/ fs 순으로 조회한다.
 *       관리자가 DB에 등록한 항목이 우선되고, DB에 없으면 content/ 폴더의 시드 파일을 사용한다.
 *       이 추상화 덕분에 회원 페이지는 데이터 출처를 신경 쓰지 않는다.
 *
 * 사용 위치:
 *   - src/app/(member)/member/templates/page.tsx
 *   - src/app/(member)/member/templates/[slug]/page.tsx
 *   - src/app/(member)/member/templates/[slug]/print/page.tsx
 *   - src/app/(member)/member/guides/[slug]/page.tsx
 */

import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { reportTemplates } from "@/lib/db/schema";
import {
  listAllTemplatesFromContent,
  readGuide,
  readTemplateFromContent,
  templateSlugs,
} from "@/lib/markdown/read-from-content";

export type TemplateView = {
  slug: string;
  title: string;
  description: string | null;
  reportCategory:
    | "management-book"
    | "classic-book"
    | "business-practice"
    | null;
  version: string;
  body: string;
  source: "db" | "content";
};

export type GuideView = {
  slug: string;
  title: string;
  description: string | null;
  version: string;
  body: string;
  source: "db" | "content";
};

const knownReportCategories = new Set([
  "management-book",
  "classic-book",
  "business-practice",
]);

function asReportCategory(
  value: string | null,
): "management-book" | "classic-book" | "business-practice" | null {
  if (value && knownReportCategories.has(value)) {
    return value as "management-book" | "classic-book" | "business-practice";
  }
  return null;
}

export async function resolveTemplate(slug: string): Promise<TemplateView | null> {
  const dbRow = await db.query.reportTemplates.findFirst({
    where: and(
      eq(reportTemplates.slug, slug),
      eq(reportTemplates.category, "template"),
      eq(reportTemplates.published, true),
    ),
  });

  if (dbRow) {
    return {
      slug: dbRow.slug,
      title: dbRow.title,
      description: dbRow.description,
      reportCategory: asReportCategory(dbRow.reportCategory),
      version: dbRow.version,
      body: dbRow.body,
      source: "db",
    };
  }

  const fileResult = await readTemplateFromContent(slug);
  if (!fileResult) return null;

  return {
    slug,
    title: fileResult.frontmatter.title,
    description: fileResult.frontmatter.description ?? null,
    reportCategory: asReportCategory(fileResult.frontmatter.reportCategory),
    version: fileResult.frontmatter.version,
    body: fileResult.body,
    source: "content",
  };
}

export async function resolveGuide(slug: string): Promise<GuideView | null> {
  const dbRow = await db.query.reportTemplates.findFirst({
    where: and(
      eq(reportTemplates.slug, slug),
      eq(reportTemplates.category, "guide"),
      eq(reportTemplates.published, true),
    ),
  });

  if (dbRow) {
    return {
      slug: dbRow.slug,
      title: dbRow.title,
      description: dbRow.description,
      version: dbRow.version,
      body: dbRow.body,
      source: "db",
    };
  }

  const fileResult = await readGuide(slug);
  if (!fileResult) return null;

  return {
    slug,
    title: fileResult.frontmatter.title,
    description: fileResult.frontmatter.description ?? null,
    version: fileResult.frontmatter.version,
    body: fileResult.body,
    source: "content",
  };
}

export async function listTemplates(): Promise<TemplateView[]> {
  // DB에 등록된 양식 우선 (published=true)
  const dbRows = await db
    .select()
    .from(reportTemplates)
    .where(
      and(
        eq(reportTemplates.category, "template"),
        eq(reportTemplates.published, true),
      ),
    )
    .orderBy(asc(reportTemplates.order), desc(reportTemplates.updatedAt));

  const fromDb: TemplateView[] = dbRows.map((row) => ({
    slug: row.slug,
    title: row.title,
    description: row.description,
    reportCategory: asReportCategory(row.reportCategory),
    version: row.version,
    body: row.body,
    source: "db",
  }));

  const dbSlugs = new Set(fromDb.map((t) => t.slug));
  // DB에 없는 시드(content/) 양식만 보충하여 중복 제거
  const fromContentAll = await listAllTemplatesFromContent();
  const fromContent: TemplateView[] = fromContentAll
    .filter((entry) => !dbSlugs.has(entry.slug))
    .map((entry) => ({
      slug: entry.slug,
      title: entry.data.frontmatter.title,
      description: entry.data.frontmatter.description ?? null,
      reportCategory: asReportCategory(entry.data.frontmatter.reportCategory),
      version: entry.data.frontmatter.version,
      body: entry.data.body,
      source: "content" as const,
    }));

  return [...fromDb, ...fromContent];
}

export const knownTemplateSlugs = templateSlugs;
