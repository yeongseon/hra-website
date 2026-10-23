/**
 * 자료실 통합 목록의 PostgreSQL 조회를 소유합니다.
 * 회원 검증 뒤 호출되며, 원본 파일 URL·본문을 목록 결과에 포함하지 않습니다.
 */
import "server-only";

import { asc, desc, eq, sql } from "drizzle-orm";
import { classMaterialReadFilter } from "@/features/class-materials/access";
import { db } from "@/lib/db";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
import { classMaterials, classLogs, cohorts, guidebooks, reportTemplates, users, weeklyTexts } from "@/lib/db/schema";

export type ApprovedResourceRole = "ADMIN" | "FACULTY" | "MEMBER";

export type ResourcesOverviewRows = {
  cohorts: { id: string; name: string }[];
  logs: {
    id: string;
    title: string;
    classDate: Date;
    createdAt: Date;
    authorName: string | null;
    cohortId: string | null;
  }[];
  weeklyTexts: {
    id: string;
    title: string;
    hasBody: boolean;
    hasFile: boolean;
    classDate: Date | null;
    createdAt: Date;
    cohortId: string | null;
    textType: string | null;
  }[];
  classMaterials: {
    id: string;
    title: string;
    classDate: Date | null;
    createdAt: Date;
    audience: string;
    weekNumber: number | null;
    lectureTitle: string | null;
    uploaderName: string | null;
  }[];
  guidebooks: { id: string; title: string; createdAt: Date }[];
  templates: {
    id: string;
    slug: string;
    title: string;
    category: "template" | "guide";
    createdAt: Date;
  }[];
};

/** 검증된 계정과 역할로만 여섯 종류의 자료·기수 목록을 병렬 조회합니다. */
export async function loadResourcesOverviewRows(verified: {
  id: string;
  role: ApprovedResourceRole;
}): Promise<ResourcesOverviewRows> {
  const [cohortRows, logs, textRows, materials, books, templates] = await Promise.all([
    // 숫자가 없는 기수명도 안전하게 뒤로 보내는 기존 공용 정렬을 사용합니다.
    db.select({ id: cohorts.id, name: cohorts.name })
      .from(cohorts)
      .orderBy(cohortNumberDesc(cohorts.name)),
    db.select({
      id: classLogs.id,
      title: classLogs.title,
      classDate: classLogs.classDate,
      createdAt: classLogs.createdAt,
      authorName: users.name,
      cohortId: classLogs.cohortId,
    })
      .from(classLogs)
      .leftJoin(users, eq(classLogs.authorId, users.id))
      .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt)),
    // 본문·파일 URL은 조회 결과에 실어 보내지 않고 기존 truthy 분기만 DB에서 계산합니다.
    db.select({
      id: weeklyTexts.id,
      title: weeklyTexts.title,
      hasBody: sql<boolean>`coalesce(${weeklyTexts.body} <> '', false)`,
      hasFile: sql<boolean>`coalesce(${weeklyTexts.fileUrl} <> '', false)`,
      classDate: weeklyTexts.classDate,
      createdAt: weeklyTexts.createdAt,
      cohortId: weeklyTexts.cohortId,
      textType: weeklyTexts.textType,
    })
      .from(weeklyTexts)
      .orderBy(sql`${weeklyTexts.classDate} DESC NULLS LAST`, desc(weeklyTexts.createdAt)),
    db.select({
      id: classMaterials.id,
      title: classMaterials.title,
      classDate: classMaterials.classDate,
      createdAt: classMaterials.createdAt,
      audience: classMaterials.audience,
      weekNumber: classMaterials.weekNumber,
      lectureTitle: classMaterials.lectureTitle,
      uploaderName: users.name,
    })
      .from(classMaterials)
      .leftJoin(users, eq(classMaterials.uploadedById, users.id))
      // 인가를 조회 후 필터가 아닌 SQL WHERE에서 강제합니다.
      .where(classMaterialReadFilter({ id: verified.id, role: verified.role }))
      .orderBy(sql`${classMaterials.classDate} DESC NULLS LAST`, desc(classMaterials.createdAt)),
    db.select({ id: guidebooks.id, title: guidebooks.title, createdAt: guidebooks.createdAt })
      .from(guidebooks)
      .orderBy(desc(guidebooks.createdAt)),
    db.select({
      id: reportTemplates.id,
      slug: reportTemplates.slug,
      title: reportTemplates.title,
      category: reportTemplates.category,
      createdAt: reportTemplates.createdAt,
    })
      .from(reportTemplates)
      .where(eq(reportTemplates.published, true))
      .orderBy(asc(reportTemplates.order), asc(reportTemplates.createdAt)),
  ]);

  return {
    cohorts: cohortRows,
    logs,
    weeklyTexts: textRows,
    classMaterials: materials,
    guidebooks: books,
    templates,
  };
}
