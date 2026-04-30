/**
 * 자료실 메인 페이지
 *
 * 역할: 가이드북(파일+보고서양식), 주차별 텍스트, 주차별 수업일지를
 *       기수 드롭다운 + 카테고리 탭으로 표시한다.
 * 사용 위치: /resources (로그인 필요)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Info, Plus } from "lucide-react";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  classMaterials,
  classLogs,
  cohorts,
  guidebooks,
  reportTemplates,
  users,
  weeklyTexts,
} from "@/lib/db/schema";
import { ResourcesTabs, type ResourceItem } from "./_components/resources-tabs";

export const metadata: Metadata = {
  title: "자료실",
};

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const session = await auth();
  const userRole = session?.user?.role;

  // ADMIN/FACULTY/MEMBER는 열람 권한이 있으므로 경고 불필요
  const showAccessWarning =
    userRole !== "ADMIN" && userRole !== "FACULTY" && userRole !== "MEMBER";
  const isAdmin = userRole === "ADMIN";
  const canViewFacultyMaterials = userRole === "ADMIN" || userRole === "FACULTY";

  // 기수(최신순), 사용자 cohortId, 자료들을 병렬 조회
  const [
    cohortRows,
    userRow,
    logs,
    allWeeklyTexts,
    allClassMaterials,
    allGuidebooks,
    allTemplates,
  ] =
    await Promise.all([
      // 기수 목록 — desc 정렬로 최신 기수가 드롭다운 상단에 위치
      db
        .select({ id: cohorts.id, name: cohorts.name })
        .from(cohorts)
        .orderBy(desc(cohorts.order), desc(cohorts.createdAt)),

      // 로그인 사용자의 cohortId 조회 (MEMBER일 때 업로드 권한 제한에 사용)
      session?.user?.id
        ? db
            .select({ cohortId: users.cohortId })
            .from(users)
            .where(eq(users.id, session.user.id))
            .limit(1)
        : Promise.resolve([]),

      // 주차별 수업일지
      db
        .select({
          id: classLogs.id,
          title: classLogs.title,
          classDate: classLogs.classDate,
          createdAt: classLogs.createdAt,
          authorName: users.name,
          cohortId: classLogs.cohortId,
        })
        .from(classLogs)
        .innerJoin(users, eq(classLogs.authorId, users.id))
        .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt)),

      // 주차별 텍스트 (textType 포함)
      db
       .select({
          id: weeklyTexts.id,
          title: weeklyTexts.title,
          fileUrl: weeklyTexts.fileUrl,
          body: weeklyTexts.body,
          createdAt: weeklyTexts.createdAt,
          cohortId: weeklyTexts.cohortId,
          textType: weeklyTexts.textType,
        })
        .from(weeklyTexts)
        .orderBy(desc(weeklyTexts.createdAt)),

      (canViewFacultyMaterials
        ? db
            .select({
              id: classMaterials.id,
              title: classMaterials.title,
              fileUrl: classMaterials.fileUrl,
              createdAt: classMaterials.createdAt,
              audience: classMaterials.audience,
              weekNumber: classMaterials.weekNumber,
              lectureTitle: classMaterials.lectureTitle,
              uploaderName: users.name,
            })
            .from(classMaterials)
            .leftJoin(users, eq(classMaterials.uploadedById, users.id))
            .orderBy(desc(classMaterials.createdAt))
        : db
            .select({
              id: classMaterials.id,
              title: classMaterials.title,
              fileUrl: classMaterials.fileUrl,
              createdAt: classMaterials.createdAt,
              audience: classMaterials.audience,
              weekNumber: classMaterials.weekNumber,
              lectureTitle: classMaterials.lectureTitle,
              uploaderName: users.name,
            })
            .from(classMaterials)
            .leftJoin(users, eq(classMaterials.uploadedById, users.id))
            .where(eq(classMaterials.audience, "STUDENT"))
            .orderBy(desc(classMaterials.createdAt))),

      // 가이드북 파일 (Vercel Blob)
      db.select().from(guidebooks).orderBy(desc(guidebooks.createdAt)),

      // 보고서 양식 — published:true인 것만, order 오름차순
      db
        .select({
          id: reportTemplates.id,
          slug: reportTemplates.slug,
          title: reportTemplates.title,
          createdAt: reportTemplates.createdAt,
        })
        .from(reportTemplates)
        .where(eq(reportTemplates.published, true))
        .orderBy(asc(reportTemplates.order), asc(reportTemplates.createdAt)),
    ]);

  // 로그인 사용자의 cohortId
  const userCohortId = (userRow as Array<{ cohortId: string | null }>)[0]?.cohortId ?? null;

  // 모든 자료를 ResourceItem 배열로 통합
  const items: ResourceItem[] = [
    // 주차별 수업일지
    ...logs.map((log) => ({
      id: `log-${log.id}`,
      title: log.title,
      category: "주차별 수업일지" as const,
      date: log.classDate,
      cohortId: log.cohortId,
      author: log.authorName,
      href: `/resources/${log.id}`,
    })),
    // 주차별 텍스트
    ...allWeeklyTexts.map((text) => ({
      id: `text-${text.id}`,
      title: text.title,
      category: "주차별 텍스트" as const,
      date: text.createdAt,
      cohortId: text.cohortId,
      textType: text.textType ?? null,
      href: text.body ? `/resources/weekly-texts/${text.id}` : undefined,
      downloadUrl: !text.body && text.fileUrl ? text.fileUrl : undefined,
    })),
    ...allClassMaterials.map((material) => ({
      id: `cm-${material.id}`,
      title: material.title,
      category: "강의 자료" as const,
      date: material.createdAt,
      cohortId: null,
      audience: material.audience,
      weekNumber: material.weekNumber,
      lectureTitle: material.lectureTitle,
      author: material.uploaderName,
      downloadUrl: material.fileUrl,
    })),
    // 가이드북 파일 — 클릭 시 뷰어 페이지(/resources/guidebooks/[id])로 이동
    ...allGuidebooks.map((book) => ({
      id: `guide-${book.id}`,
      title: book.title,
      category: "가이드북" as const,
      date: book.createdAt,
      cohortId: null,
      href: `/resources/guidebooks/${book.id}`,
    })),
    // 보고서 양식 — 클릭 시 .md 파일 다운로드 (마크다운 양식)
    ...allTemplates.map((tmpl) => ({
      id: `tmpl-${tmpl.id}`,
      title: tmpl.title,
      category: "가이드북" as const,
      date: tmpl.createdAt,
      cohortId: null,
      href: `/member/templates/${tmpl.slug}`,
    })),
  ];

  // 최신순 정렬
  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 space-y-4 text-center sm:text-left">
        <div className="flex items-center gap-4 mb-4 justify-center sm:justify-start">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#1a1a1a]">자료실</h1>
        </div>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base mx-auto sm:mx-0">
          가이드북, 주차별 텍스트, 수업일지 등 HRA 교육 자료를 확인하세요.
        </p>
        {/* 관리자 전용 자료 추가 버튼 */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            <Link
              href="/admin/resources/new"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors"
            >
              <Plus className="size-4" />수업일지 추가
            </Link>
            <Link
              href="/admin/resources/weekly-texts/new"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors"
            >
              <Plus className="size-4" />주차별 텍스트 추가
            </Link>
            <Link
              href="/admin/resources/guidebooks/new"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors"
            >
              <Plus className="size-4" />가이드북 추가
            </Link>
          </div>
        )}
      </section>

      {/* PENDING 사용자에게 열람 권한 안내 */}
      {showAccessWarning && (
        <section className="mb-12">
          <div className="relative overflow-hidden rounded-2xl bg-amber-50 border border-amber-200 p-6 md:p-8 shadow-[var(--shadow-soft)]">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
            <div className="flex items-start sm:items-center gap-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center border border-amber-200">
                <Info className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-amber-800 mb-1">열람 권한 안내</h3>
                <p className="text-[#666666] text-sm md:text-base leading-relaxed">
                  자료실의 일부 콘텐츠는 수료생, 교수진, 운영진 등 내부 회원만 열람할 수
                  있습니다.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 자료실 탭 필터 + 목록 */}
      <ResourcesTabs
        items={items}
        cohorts={cohortRows}
        userCohortId={userCohortId}
        userRole={userRole ?? null}
      />
    </div>
  );
}
