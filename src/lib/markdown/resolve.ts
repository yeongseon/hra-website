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
  createdAt: Date | null;
  updatedAt: Date | null;
};

export type GuideView = {
  slug: string;
  title: string;
  description: string | null;
  version: string;
  body: string;
  source: "db" | "content";
  createdAt: Date | null;
  updatedAt: Date | null;
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
  // 같은 slug의 DB row 존재 여부를 published와 무관하게 먼저 확인한다.
  // 운영자가 관리자 페이지에서 비공개(published=false) 처리한 항목이라면
  // content/ 시드로 fallback해서는 안 된다(= "삭제했는데 다시 보임" 방지).
  const dbRow = await db.query.reportTemplates.findFirst({
    where: and(
      eq(reportTemplates.slug, slug),
      eq(reportTemplates.category, "template"),
    ),
  });

  if (dbRow) {
    if (!dbRow.published) {
      // DB row는 있지만 비공개 → 회원에게 노출하지 않는다(fallback 금지).
      return null;
    }
    return {
      slug: dbRow.slug,
      title: dbRow.title,
      description: dbRow.description,
      reportCategory: asReportCategory(dbRow.reportCategory),
      version: dbRow.version,
      body: dbRow.body,
      source: "db",
      createdAt: dbRow.createdAt,
      updatedAt: dbRow.updatedAt,
    };
  }

  // DB row가 아예 없을 때만 content/ 시드로 fallback한다.
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
    createdAt: null,
    updatedAt: null,
  };
}

export async function resolveGuide(slug: string): Promise<GuideView | null> {
  // resolveTemplate과 동일한 정책: DB row가 있으면 published 여부에 따라
  // 노출(true) 또는 차단(false)하고, DB row가 없을 때만 content/ fallback한다.
  const dbRow = await db.query.reportTemplates.findFirst({
    where: and(
      eq(reportTemplates.slug, slug),
      eq(reportTemplates.category, "guide"),
    ),
  });

  if (dbRow) {
    if (!dbRow.published) {
      return null;
    }
    return {
      slug: dbRow.slug,
      title: dbRow.title,
      description: dbRow.description,
      version: dbRow.version,
      body: dbRow.body,
      source: "db",
      createdAt: dbRow.createdAt,
      updatedAt: dbRow.updatedAt,
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
    createdAt: null,
    updatedAt: null,
  };
}

export async function listTemplates(): Promise<TemplateView[]> {
  // category=template인 모든 row를 published 무관하게 먼저 조회한다.
  // - published=true row만 회원 목록에 노출한다.
  // - published=false row의 slug는 content/ fallback에서 제외한다.
  //   (운영자가 비공개로 돌린 양식이 시드로 다시 살아나는 것을 방지)
  const dbRows = await db
    .select()
    .from(reportTemplates)
    .where(eq(reportTemplates.category, "template"))
    .orderBy(asc(reportTemplates.order), desc(reportTemplates.updatedAt));

  const fromDb: TemplateView[] = dbRows
    .filter((row) => row.published)
    .map((row) => ({
      slug: row.slug,
      title: row.title,
      description: row.description,
      reportCategory: asReportCategory(row.reportCategory),
      version: row.version,
      body: row.body,
      source: "db" as const,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    }));

  // 비공개 슬러그까지 포함해 차단 집합을 만든다(=DB가 소유권을 주장한 slug).
  const blockedSlugs = new Set(dbRows.map((row) => row.slug));
  const fromContentAll = await listAllTemplatesFromContent();
  const fromContent: TemplateView[] = fromContentAll
    .filter((entry) => !blockedSlugs.has(entry.slug))
    .map((entry) => ({
      slug: entry.slug,
      title: entry.data.frontmatter.title,
      description: entry.data.frontmatter.description ?? null,
      reportCategory: asReportCategory(entry.data.frontmatter.reportCategory),
      version: entry.data.frontmatter.version,
      body: entry.data.body,
      source: "content" as const,
      createdAt: null,
      updatedAt: null,
    }));

  return [...fromDb, ...fromContent];
}

export const knownTemplateSlugs = templateSlugs;
