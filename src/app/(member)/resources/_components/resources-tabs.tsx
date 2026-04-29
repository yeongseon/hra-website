"use client";

/**
 * 자료실 탭 컴포넌트
 *
 * 기수 탭 (전체/1기/2기/...) + 카테고리 탭으로 자료를 필터링합니다.
 * - MEMBER: 자신의 기수 탭에서만 업로드 버튼 노출
 * - ADMIN/FACULTY: 기수 탭 선택 시 업로드 버튼 노출
 * - 가이드북은 기수 구분 없이 모든 탭에서 표시
 */

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ResourceCategory = "주차별 수업일지" | "주차별 텍스트" | "가이드북";

export type ResourceItem = {
  id: number | string;
  title: string;
  category: ResourceCategory;
  date: Date;
  cohortId?: string | null;
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

const categoryTabs: ("전체" | ResourceCategory)[] = [
  "전체",
  "주차별 수업일지",
  "주차별 텍스트",
  "가이드북",
];

const getCategoryColor = (category: ResourceCategory) => {
  switch (category) {
    case "주차별 수업일지": return "bg-blue-50 text-blue-700 border-blue-200";
    case "주차별 텍스트": return "bg-green-50 text-green-700 border-green-200";
    case "가이드북": return "bg-orange-50 text-orange-700 border-orange-200";
  }
};

export function ResourcesTabs({ items, cohorts, userCohortId, userRole }: ResourcesTabsProps) {
  const [activeCohort, setActiveCohort] = useState<string>("전체");
  const [activeCategory, setActiveCategory] = useState<"전체" | ResourceCategory>("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const isAdminOrFaculty = userRole === "ADMIN" || userRole === "FACULTY";
  const isMember = userRole === "MEMBER";

  // MEMBER는 자신의 기수 탭에서만, ADMIN/FACULTY는 기수 탭 선택 시 업로드 버튼 노출
  const showUploadButton =
    (isAdminOrFaculty && activeCohort !== "전체") ||
    (isMember && userCohortId !== null && activeCohort === userCohortId);

  // 업로드 링크에 넣을 기수 ID
  const uploadCohortId = isMember ? userCohortId : activeCohort !== "전체" ? activeCohort : null;

  const filteredItems = items.filter((item) => {
    let matchesCohort: boolean;
    if (activeCohort === "전체") {
      matchesCohort = true;
    } else if (item.category === "가이드북") {
      matchesCohort = true; // 가이드북은 모든 기수 탭에서 표시
    } else {
      matchesCohort = item.cohortId === activeCohort;
    }
    const matchesCategory = activeCategory === "전체" || item.category === activeCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCohort && matchesCategory && matchesSearch;
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  const handleCohortChange = (cohortId: string) => {
    setActiveCohort(cohortId);
    setCurrentPage(1);
  };

  const handleCategoryChange = (category: "전체" | ResourceCategory) => {
    setActiveCategory(category);
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
      {/* 기수 탭 (pill 형태) */}
      {cohorts.length > 0 && (
        <div className="flex overflow-x-auto pb-1 gap-2">
          <button
            type="button"
            onClick={() => handleCohortChange("전체")}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeCohort === "전체"
                ? "bg-[#1a1a1a] text-white"
                : "bg-white border border-[#D9D9D9] text-[#666666] hover:border-[#1a1a1a] hover:text-[#1a1a1a]"
            }`}
          >
            전체
          </button>
          {cohorts.map((cohort) => (
            <button
              key={cohort.id}
              type="button"
              onClick={() => handleCohortChange(cohort.id)}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeCohort === cohort.id
                  ? "bg-[#2563EB] text-white"
                  : "bg-white border border-[#D9D9D9] text-[#666666] hover:border-[#2563EB] hover:text-[#2563EB]"
              }`}
            >
              {cohort.name}
            </button>
          ))}
        </div>
      )}

      {/* 카테고리 탭 + 검색 + 업로드 버튼 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto gap-4 sm:gap-6 border-b border-[#D9D9D9]">
          {categoryTabs.map((tab) => (
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
          {/* 해당 기수 멤버 또는 관리자/교수만 업로드 버튼 노출 */}
          {showUploadButton && uploadCohortId && (
            <Link
              href={`/resources/weekly-texts?cohortId=${uploadCohortId}`}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-[#1a1a1a] text-white hover:bg-[#333333] transition-colors whitespace-nowrap"
            >
              <Upload className="size-3.5" />
              업로드
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

      {/* 자료 목록 */}
      <div className="overflow-x-auto rounded-lg border border-[#D9D9D9] bg-white">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="bg-gray-50 text-[#666666] text-sm border-b border-[#D9D9D9]">
              <th className="px-4 py-3 font-medium min-w-[300px]">제목</th>
              <th className="px-4 py-3 font-medium whitespace-nowrap w-32">카테고리</th>
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
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge
                      variant="outline"
                      className={`${getCategoryColor(item.category)} whitespace-nowrap`}
                    >
                      {item.category}
                    </Badge>
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
                  {activeCohort !== "전체"
                    ? "해당 기수의 자료가 없습니다."
                    : "검색 결과가 없습니다."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

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
