/**
 * 자료실 메인 페이지
 *
 * 역할: 수업일지, 주차별 텍스트, 가이드북을 기수별 탭 + 카테고리 탭으로 표시한다.
 * 사용 위치: /resources (로그인 필요)
 * 주요 기능:
 *   - ADMIN/FACULTY/MEMBER 열람 가능, PENDING은 접근 경고 표시
 *   - 기수 탭 (전체/1기/2기/...) + 카테고리 탭으로 필터링
 *   - MEMBER는 자신의 기수 탭에서만 업로드 버튼 노출
 *   - ADMIN/FACULTY는 기수 탭 선택 시 업로드 버튼 노출
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Info, Plus } from "lucide-react";
import { asc, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classLogs, cohorts, guidebooks, users, weeklyTexts } from "@/lib/db/schema";
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

  // 기수 목록, 사용자 cohortId, 자료들을 병렬 조회
  const [cohortRows, userRow, logs, allWeeklyTexts, allGuidebooks] = await Promise.all([
    // 기수 목록 (order 오름차순 정렬)
    db
      .select({ id: cohorts.id, name: cohorts.name })
      .from(cohorts)
      .orderBy(asc(cohorts.order), asc(cohorts.createdAt)),

    // 로그인 사용자의 cohortId 조회 (MEMBER일 때 사용)
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
        cohortId: classLogs.cohortId, // 기수 필터링에 사용
      })
      .from(classLogs)
      .innerJoin(users, eq(classLogs.authorId, users.id))
      .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt)),

    // 주차별 텍스트
    db
      .select({
        id: weeklyTexts.id,
        title: weeklyTexts.title,
        fileUrl: weeklyTexts.fileUrl,
        createdAt: weeklyTexts.createdAt,
        cohortId: weeklyTexts.cohortId, // 기수 필터링에 사용
      })
      .from(weeklyTexts)
      .orderBy(desc(weeklyTexts.createdAt)),

    // 가이드북 (기수 구분 없음)
    db.select().from(guidebooks).orderBy(desc(guidebooks.createdAt)),
  ]);

  // 로그인 사용자의 cohortId (MEMBER가 아닌 경우 null)
  const userCohortId = (userRow as Array<{ cohortId: string | null }>)[0]?.cohortId ?? null;

  // 모든 자료를 ResourceItem 배열로 통합
  const items: ResourceItem[] = [
    ...logs.map((log) => ({
      id: `log-${log.id}`,
      title: log.title,
      category: "주차별 수업일지" as const,
      date: log.classDate,
      cohortId: log.cohortId,
      author: log.authorName,
      href: `/resources/${log.id}`,
    })),
    ...allWeeklyTexts.map((text) => ({
      id: `text-${text.id}`,
      title: text.title,
      category: "주차별 텍스트" as const,
      date: text.createdAt,
      cohortId: text.cohortId,
      downloadUrl: text.fileUrl,
    })),
    ...allGuidebooks.map((book) => ({
      id: `guide-${book.id}`,
      title: book.title,
      category: "가이드북" as const,
      date: book.createdAt,
      cohortId: null, // 가이드북은 기수 구분 없음 — 모든 기수 탭에서 표시
      downloadUrl: book.fileUrl,
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
          주차별 수업일지, 주차별 텍스트, 가이드북 등 HRA 교육 자료를 확인하세요.
        </p>
        {/* 관리자 전용 자료 추가 버튼 */}
        {isAdmin && (
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            <Link
              href="/admin/resources/new"
              className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-md bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors"
            >
              <Plus className="size-4" />주차별 수업일지 추가
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

      {/* 기수 탭 + 카테고리 탭 자료 목록 */}
      <ResourcesTabs
        items={items}
        cohorts={cohortRows}
        userCohortId={userCohortId}
        userRole={userRole ?? null}
      />
    </div>
  );
}
