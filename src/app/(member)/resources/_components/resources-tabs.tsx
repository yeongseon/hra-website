"use client";

/**
 * 자료실 필터 + 목록 컴포넌트
 *
 * 역할: 기수 드롭다운 + 카테고리 탭 + (주차별 텍스트 전용) 서브필터로
 *       자료를 필터링해 페이지네이션 테이블로 표시한다.
 *
 * 탭 순서: 가이드북 → 강의 자료 → 주차별 텍스트 → 주차별 수업일지 → 보고서 양식 ("전체" 없음)
 * 기수 기본값: 최신 기수 (page.tsx에서 desc 정렬된 cohorts[0])
 * ALL_COHORT sentinel: "__all__" (UUID와 절대 충돌하지 않는 내부 상수)
 * 주차별 텍스트 서브필터: 전체 / 고전명작 / 경영서 / 기업실무
 *
 * 사용 위치: src/app/(member)/resources/page.tsx
 */

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** 기수 "전체" 상태를 나타내는 sentinel 값 — UUID와 충돌하지 않음 */
const ALL_COHORT = "__all__";

/** 주차별 텍스트 분류 목록 */
export const WEEKLY_TEXT_TYPES = ["고전명작", "경영서", "기업실무"] as const;
export type WeeklyTextType = (typeof WEEKLY_TEXT_TYPES)[number];

const CLASS_MATERIAL_AUDIENCE_FILTERS = ["전체", "학생용", "교수용"] as const;
type ClassMaterialAudienceFilter = (typeof CLASS_MATERIAL_AUDIENCE_FILTERS)[number];

/** 카테고리 탭 — 표시 순서 그대로 */
export type ResourceCategory = "가이드북" | "강의 자료" | "주차별 텍스트" | "주차별 수업일지" | "보고서 양식";

const CATEGORY_TABS: ResourceCategory[] = [
  "가이드북",
  "강의 자료",
  "주차별 텍스트",
  "주차별 수업일지",
  "보고서 양식",
];

export type ResourceItem = {
  id: number | string;
  title: string;
  category: ResourceCategory;
  date: Date;
  cohortId?: string | null;
  /** 주차별 텍스트 분류 (null = 미분류) */
  textType?: string | null;
  audience?: string | null;
  weekNumber?: number | null;
  lectureTitle?: string | null;
  author?: string | null;
  href?: string;
  downloadUrl?: string;
};

interface ResourcesTabsProps {
  items: ResourceItem[];
  cohorts: { id: string; name: string }[];
  userCohortId: string | null;
  userRole: "ADMIN" | "FACULTY" | "MEMBER" | "PENDING" | null;
}

/** 카테고리별 배지 색상 */
const getCategoryColor = (category: ResourceCategory): string => {
  switch (category) {
    case "가이드북":
      return "bg-orange-50 text-orange-700 border-orange-200";
    case "강의 자료":
      return "bg-purple-50 text-purple-700 border-purple-200";
    case "주차별 텍스트":
      return "bg-green-50 text-green-700 border-green-200";
    case "주차별 수업일지":
      return "bg-blue-50 text-blue-700 border-blue-200";
    case "보고서 양식":
      return "bg-blue-50 text-blue-700 border-blue-200";
  }
};

export function ResourcesTabs({ items, cohorts, userCohortId, userRole }: ResourcesTabsProps) {
  // 기수 기본값: 최신 기수(desc 정렬된 cohorts[0]). 기수 없으면 "전체"
  const defaultCohort = cohorts[0]?.id ?? ALL_COHORT;

  const [activeCohort, setActiveCohort] = useState<string>(defaultCohort);
  const [activeCategory, setActiveCategory] = useState<ResourceCategory>("가이드북");
  // 주차별 텍스트 서브필터 — 탭 전환 시 초기화하지 않고 유지
  const [activeTextType, setActiveTextType] = useState<WeeklyTextType | "전체">("전체");
  const [activeClassMaterialAudience, setActiveClassMaterialAudience] =
    useState<ClassMaterialAudienceFilter>("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isAdminOrFaculty = userRole === "ADMIN" || userRole === "FACULTY";
  const isMember = userRole === "MEMBER";

  const showWeeklyTextUploadButton =
    activeCategory === "주차별 텍스트" &&
    ((isAdminOrFaculty && activeCohort !== ALL_COHORT) ||
      (isMember && userCohortId !== null && activeCohort === userCohortId));

  const showClassMaterialUploadButton =
    activeCategory === "강의 자료" && (userRole === "ADMIN" || userRole === "FACULTY");

  const showClassLogUploadButton =
    activeCategory === "주차별 수업일지" &&
    (isAdminOrFaculty || (isMember && userCohortId !== null));

  // 업로드 링크에 넘길 cohortId
  const uploadCohortId =
    isMember ? userCohortId : activeCohort !== ALL_COHORT ? activeCohort : null;

  // 필터링 로직
  const filteredItems = items.filter((item) => {
    // 기수 필터: 가이드북은 기수 무관 항상 표시
    const matchesCohort =
      activeCohort === ALL_COHORT ||
      item.category === "가이드북" ||
      item.cohortId === activeCohort;

    // 카테고리 탭 필터
    const matchesCategory = item.category === activeCategory;

    // 주차별 텍스트 서브필터
    const matchesTextType =
      activeCategory !== "주차별 텍스트" ||
      activeTextType === "전체" ||
      item.textType === activeTextType;

    const matchesClassMaterialAudience =
      activeCategory !== "강의 자료" ||
      activeClassMaterialAudience === "전체" ||
      (activeClassMaterialAudience === "학생용" && item.audience === "STUDENT") ||
      (activeClassMaterialAudience === "교수용" && item.audience === "FACULTY");

    // 검색어 필터
    const matchesSearch = [item.title, item.lectureTitle, item.author]
      .filter((value): value is string => typeof value === "string")
      .some((value) => value.toLowerCase().includes(searchQuery.toLowerCase()));

    return (
      matchesCohort &&
      matchesCategory &&
      matchesTextType &&
      matchesClassMaterialAudience &&
      matchesSearch
    );
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  /** 기수 드롭다운용 items (ALL_COHORT + 기수 목록) */
  const cohortSelectItems = [
    { value: ALL_COHORT, label: "전체" },
    ...cohorts.map((c) => ({ value: c.id, label: c.name })),
  ];

  const handleCohortChange = (value: string | null) => {
    setActiveCohort(value ?? ALL_COHORT);
    setCurrentPage(1);
  };

  const handleCategoryChange = (category: ResourceCategory) => {
    setActiveCategory(category);
    setCurrentPage(1);
  };

  const handleTextTypeChange = (type: WeeklyTextType | "전체") => {
    setActiveTextType(type);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));

  return (
    <div className="space-y-6">
      {/* 기수 드롭다운 — items prop으로 value→label 매핑 제공 (UUID 표시 버그 방지) */}
      {cohorts.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-[#1a1a1a] shrink-0">기수</span>
          <Select
            items={cohortSelectItems}
            value={activeCohort}
            onValueChange={handleCohortChange}
          >
            <SelectTrigger className="w-36 h-9 border-[#D9D9D9] bg-white text-[#1a1a1a] text-sm">
              <SelectValue placeholder="전체" />
            </SelectTrigger>
            <SelectContent>
              {cohortSelectItems.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 카테고리 탭 + 검색 + 업로드 버튼 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto gap-4 sm:gap-6 border-b border-[#D9D9D9]">
          {CATEGORY_TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleCategoryChange(tab)}
              className={`whitespace-nowrap pb-3 text-sm md:text-base transition-colors relative ${
                activeCategory === tab
                  ? "border-b-2 border-[#2563EB] text-[#2563EB] font-medium"
                  : "text-[#666666] hover:text-[#1a1a1a]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {showClassLogUploadButton && (
            <Link
              href="/resources/class-logs"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors whitespace-nowrap"
            >
              <Upload className="size-3.5" />
              수업일지 작성
            </Link>
          )}
          {showWeeklyTextUploadButton && uploadCohortId && (
            <Link
              href={`/resources/weekly-texts?cohortId=${uploadCohortId}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors whitespace-nowrap"
            >
              <Upload className="size-3.5" />
              업로드
            </Link>
          )}
          {showClassMaterialUploadButton && (
            <Link
              href="/resources/class-materials"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1a1a1a] px-3 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-[#333333]"
            >
              <Upload className="size-3.5" />
              자료 업로드
            </Link>
          )}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#666666]" />
            <input
              type="text"
              placeholder="자료 검색..."
              className="w-full pl-10 pr-4 py-2.5 border border-[#D9D9D9] rounded-lg text-sm focus:outline-none focus:border-[#2563EB] transition-colors"
              value={searchQuery}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      </div>

      {/* 주차별 텍스트 서브필터 (탭이 "주차별 텍스트"일 때만 표시) */}
      {activeCategory === "주차별 텍스트" && (
        <div className="flex gap-2 flex-wrap">
          {(["전체", ...WEEKLY_TEXT_TYPES] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTextTypeChange(type)}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeTextType === type
                  ? "bg-[#2563EB] text-white"
                  : "bg-white border border-[#D9D9D9] text-[#666666] hover:border-[#2563EB] hover:text-[#2563EB]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {activeCategory === "강의 자료" && (
        <div className="flex gap-2 flex-wrap">
          {CLASS_MATERIAL_AUDIENCE_FILTERS.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setActiveClassMaterialAudience(type);
                setCurrentPage(1);
              }}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                activeClassMaterialAudience === type
                  ? "bg-[#2563EB] text-white"
                  : "bg-white border border-[#D9D9D9] text-[#666666] hover:border-[#2563EB] hover:text-[#2563EB]"
              }`}
            >
              {type}
            </button>
          ))}
        </div>
      )}

      {/* 자료 목록 테이블 */}
      <div className="overflow-x-auto rounded-lg border border-[#D9D9D9] bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-gray-50 text-[#666666] text-sm border-b border-[#D9D9D9]">
              <th className="px-4 py-3 font-medium min-w-[300px]">제목</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap w-32">분류</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap w-32">작성자</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap w-32">날짜</th>
            </tr>
          </thead>
          <tbody>
            {currentItems.length > 0 ? (
              currentItems.map((item) => (
                <tr
                  key={item.id}
                  className="border-b border-[#D9D9D9] hover:bg-gray-50 transition-colors last:border-0"
                >
                  <td className="px-4 py-3.5">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="text-[#1a1a1a] hover:text-[#2563EB] font-medium transition-colors block"
                      >
                        {item.title}
                      </Link>
                   ) : item.downloadUrl ? (
                      <a
                        href={item.downloadUrl}
                        download
                        className="text-[#1a1a1a] hover:text-[#2563EB] font-medium transition-colors block"
                      >
                        {item.title}
                      </a>
                    ) : (
                      <span className="text-[#1a1a1a] font-medium">{item.title}</span>
                    )}
                    {item.category === "강의 자료" && (item.weekNumber || item.lectureTitle) ? (
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-[#666666]">
                        {item.weekNumber ? <span>{item.weekNumber}주차</span> : null}
                        {item.lectureTitle ? <span>{item.lectureTitle}</span> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3.5">
                    {/* 주차별 텍스트는 textType 배지, 나머지는 카테고리 배지 */}
                    {item.category === "주차별 텍스트" ? (
                      <Badge
                        variant="outline"
                        className={`whitespace-nowrap ${
                          item.textType
                            ? "bg-green-50 text-green-700 border-green-200"
                            : "bg-gray-50 text-[#666666] border-[#D9D9D9]"
                        }`}
                      >
                        {item.textType ?? "미분류"}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className={`${getCategoryColor(item.category)} whitespace-nowrap`}
                      >
                        {item.category}
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#666666] whitespace-nowrap">
                    {item.author || "-"}
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#666666] whitespace-nowrap">
                    {formatDate(item.date)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-12 text-center text-[#666666]">
                  {searchQuery
                    ? "검색 결과가 없습니다."
                    : activeCohort !== ALL_COHORT
                      ? "해당 기수의 자료가 없습니다."
                      : "등록된 자료가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="border-[#D9D9D9] text-[#666666]"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
              <Button
                key={page}
                variant={currentPage === page ? "default" : "outline"}
                onClick={() => setCurrentPage(page)}
                className={`w-9 h-9 p-0 ${
                  currentPage === page
                    ? "bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
                    : "border border-[#D9D9D9] text-[#666666] hover:bg-gray-50"
                }`}
              >
                {page}
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="border-[#D9D9D9] text-[#666666]"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
