"use client";

import { useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";

type FacultyCategory = "CLASSICS" | "BUSINESS" | "LECTURE";

type FacultyMember = {
  id: string;
  name: string;
  category: FacultyCategory;
  currentPosition: string | null;
  formerPosition: string | null;
  imageUrl: string | null;
  order: number;
};

const CATEGORIES: { id: FacultyCategory; label: string }[] = [
  { id: "CLASSICS", label: "고전 읽기" },
  { id: "BUSINESS", label: "케이스 스터디" },
  { id: "LECTURE", label: "특강" },
];

export function FacultyTabs({
  displayFacultyByCategory,
}: {
  displayFacultyByCategory: Record<FacultyCategory, FacultyMember[]>;
}) {
  const [activeTab, setActiveTab] = useState<FacultyCategory>("CLASSICS");

  const currentMembers = displayFacultyByCategory[activeTab];

  return (
    <div>
      {/* 탭 네비게이션 */}
      <div className="flex gap-8 border-b border-[#D9D9D9] mb-6 overflow-x-auto">
        {CATEGORIES.map((category) => {
          const isActive = activeTab === category.id;
          const memberCount = displayFacultyByCategory[category.id].length;

          return (
            <button
              key={category.id}
              type="button"
              onClick={() => setActiveTab(category.id)}
              className={`flex items-center gap-2 pb-4 whitespace-nowrap transition-colors ${
                isActive
                  ? "text-[#2563EB] border-b-2 border-[#2563EB] font-semibold"
                  : "text-[#666666] border-b-2 border-transparent hover:text-[#1a1a1a]"
              }`}
            >
              <span className="text-lg">{category.label}</span>
              <Badge
                variant="outline"
                className={`ml-1 ${
                  isActive
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-[#D9D9D9] bg-white text-[#666666]"
                }`}
              >
                {memberCount}명
              </Badge>
            </button>
          );
        })}
      </div>

      {/* 선택된 카테고리의 교수진 목록 */}
      <div className="rounded-2xl bg-[#f9fafb] p-6 mt-6">
        {currentMembers.length === 0 ? (
          <div className="rounded-2xl border border-[#D9D9D9] bg-white px-6 py-10 text-center text-sm text-[#666666] shadow-[var(--shadow-soft)] sm:text-base">
            등록된 교수진 정보가 없습니다.
          </div>
        ) : (
          <div className="rounded-2xl border border-[#D9D9D9] bg-white px-6 shadow-[var(--shadow-soft)]">
            {currentMembers.map((member) => (
              <div
                key={member.id}
                className="flex gap-6 border-b border-[#D9D9D9] py-6 last:border-0"
              >
                {/* 프로필 이미지 또는 이름 이니셜 */}
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-blue-50 text-lg font-bold text-blue-600">
                  {member.imageUrl ? (
                    <Image
                      src={member.imageUrl}
                      alt={`${member.name} 교수`}
                      width={56}
                      height={56}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    member.name.charAt(0)
                  )}
                </div>
                
                {/* 교수진 정보 */}
                <div className="flex flex-col justify-center">
                  <h3 className="mb-1 text-lg font-bold text-blue-600">{member.name}</h3>
                  <div className="space-y-1 text-sm leading-relaxed text-[#1a1a1a] md:text-base">
                    {member.currentPosition ? <p>(現) {member.currentPosition}</p> : null}
                    {member.formerPosition ? <p>(前) {member.formerPosition}</p> : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
