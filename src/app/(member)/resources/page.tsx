/**
 * 자료실 메인 페이지
 *
 * 역할: 가이드북(파일+보고서양식), 주차별 텍스트, 주차별 수업일지를
 *       기수 드롭다운 + 카테고리 탭으로 표시한다.
 * 사용 위치: /resources (로그인 필요)
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { requireSharedResourceReader } from "@/lib/resource-access";
import { getResourcesOverview } from "@/features/resources/overview/service";
import { ResourcesTabs, type ResourceItem } from "./_components/resources-tabs";

export const metadata: Metadata = {
  title: "자료실",
};

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ category?: string | string[] }>;
};

export default async function ResourcesPage({ searchParams }: Props) {
  const requestedCategory = (await searchParams).category;
  const initialCategory = typeof requestedCategory === "string" ? requestedCategory : undefined;
  const session = await requireSharedResourceReader();
  // Page는 Web 세션만 전달하고, 현재 계정·역할 및 자료 조회는 공용 서비스에 맡깁니다.
  const overview = await getResourcesOverview({ userId: session.user.id, role: session.user.role });
  if (overview.kind === "unauthenticated") redirect("/login");
  if (overview.kind === "forbidden") redirect("/pending");

  const userRole = overview.role;
  const isAdmin = userRole === "ADMIN";
  const { cohorts: cohortRows, userCohortId, logs, weeklyTexts: allWeeklyTexts,
    classMaterials: allClassMaterials, guidebooks: allGuidebooks, templates: allTemplates } = overview;

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
      date: text.classDate ?? text.createdAt,
      cohortId: text.cohortId,
      textType: text.textType ?? null,
      href: text.hasBody ? `/resources/weekly-texts/${text.id}` : undefined,
      downloadUrl: !text.hasBody && text.hasFile ? `/api/resources/weekly-texts/${text.id}/download` : undefined,
    })),
    ...allClassMaterials.map((material) => ({
      id: `cm-${material.id}`,
      title: material.title,
      category: "강의 자료" as const,
      date: material.classDate ?? material.createdAt,
      cohortId: null,
      audience: material.audience,
      weekNumber: material.weekNumber,
      lectureTitle: material.lectureTitle,
      author: material.uploaderName,
      href: `/resources/class-materials/${material.id}`,
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
    // 보고서 양식/가이드 — category에 따라 상세 경로 분기
    ...allTemplates.map((tmpl) => ({
      id: `tmpl-${tmpl.id}`,
      title: tmpl.title,
      category: "보고서 양식" as const,
      date: tmpl.createdAt,
      cohortId: null,
      href: tmpl.category === "guide"
        ? `/member/guides/${tmpl.slug}`
        : `/member/templates/${tmpl.slug}`,
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

      {/* 자료실 탭 필터 + 목록 */}
      <ResourcesTabs
        key={initialCategory}
        initialCategory={initialCategory}
        items={items}
        cohorts={cohortRows}
        userCohortId={userCohortId}
        userRole={userRole ?? null}
      />
    </div>
  );
}
