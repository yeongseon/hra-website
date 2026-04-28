"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ResourceCategory = "수업일지" | "주차별 텍스트" | "가이드북";

export type ResourceItem = {
  id: number | string;
  title: string;
  category: ResourceCategory;
  date: Date;
  author?: string | null;
  href?: string;
  downloadUrl?: string;
};

interface ResourcesTabsProps {
  items: ResourceItem[];
}

const tabs: ("전체" | ResourceCategory)[] = ["전체", "수업일지", "주차별 텍스트", "가이드북"];

export function ResourcesTabs({ items }: ResourcesTabsProps) {
  const [activeTab, setActiveTab] = useState<"전체" | ResourceCategory>("전체");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const filteredItems = items.filter((item) => {
    const matchesTab = activeTab === "전체" || item.category === activeTab;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const currentItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  const handleTabChange = (tab: "전체" | ResourceCategory) => {
    setActiveTab(tab);
    setCurrentPage(1);
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(date));
  };

  const getCategoryColor = (category: ResourceCategory) => {
    switch (category) {
      case "수업일지": return "bg-blue-50 text-blue-700 border-blue-200";
      case "주차별 텍스트": return "bg-green-50 text-green-700 border-green-200";
      case "가이드북": return "bg-orange-50 text-orange-700 border-orange-200";
      default: return "bg-gray-50 text-gray-700 border-gray-200";
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto gap-4 sm:gap-6 border-b border-[#D9D9D9]">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => handleTabChange(tab)}
              className={`whitespace-nowrap pb-3 text-sm md:text-base transition-colors relative ${
                activeTab === tab
                  ? "border-b-2 border-[#2563EB] text-[#2563EB] font-medium"
                  : "text-[#666666] hover:text-[#1a1a1a]"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64 shrink-0">
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
                <tr key={item.id} className="border-b border-[#D9D9D9] hover:bg-gray-50 transition-colors last:border-0">
                  <td className="px-4 py-3.5">
                    {item.href ? (
                      <Link href={item.href} className="text-[#1a1a1a] hover:text-[#2563EB] font-medium transition-colors block">
                        {item.title}
                      </Link>
                    ) : item.downloadUrl ? (
                      <a href={item.downloadUrl} download className="text-[#1a1a1a] hover:text-[#2563EB] font-medium transition-colors block">
                        {item.title}
                      </a>
                    ) : (
                      <span className="text-[#1a1a1a] font-medium">{item.title}</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant="outline" className={`${getCategoryColor(item.category)} whitespace-nowrap`}>
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
                  검색 결과가 없습니다.
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