"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Story {
  id: string;
  name: string;
  title: string | null;
  content: string;
  imageUrl: string | null;
}

interface AlumniSidebarProps {
  stories: Story[];
  currentStoryId: string;
}

const ITEMS_PER_PAGE = 3;

export function AlumniSidebar({ stories, currentStoryId }: AlumniSidebarProps) {
  const [currentPage, setCurrentPage] = useState(1);

  const filteredStories = stories.filter((s) => s.id !== currentStoryId);
  const totalPages = Math.ceil(filteredStories.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentStories = filteredStories.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  return (
    <div className="sticky top-24">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-[#1a1a1a] mb-2">수료생 이야기</h2>
        <div className="w-10 h-1 bg-[#3B82F6] mx-auto mb-6 rounded-full" />
      </div>

      <div className="flex flex-col gap-6 mb-8">
        {currentStories.map((story) => (
          <Link
            key={story.id}
            href={`/alumni/${story.id}`}
            className="group block bg-white rounded-lg border border-[#D9D9D9] overflow-hidden hover:shadow-[var(--shadow-soft)] transition-shadow"
          >
            <div className="relative h-[120px] w-full bg-gradient-to-br from-gray-100 to-gray-200 flex-shrink-0 border-b border-[#D9D9D9]">
              {story.imageUrl ? (
                <Image
                  src={story.imageUrl}
                  alt={story.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 350px"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-gray-400 font-medium text-sm">No Image</span>
                </div>
              )}
            </div>
            <div className="p-4">
              <h3 className="text-[16px] font-bold text-[#1a1a1a] line-clamp-1 mb-1 group-hover:underline">
                {story.title || `${story.name}의 이야기`}
              </h3>
              <p className="text-[14px] text-[#666666] line-clamp-2 mb-2">
                {story.content}
              </p>
              <p className="text-sm font-medium text-[#2563EB]">
                {story.name}
              </p>
            </div>
          </Link>
        ))}
        {currentStories.length === 0 && (
          <p className="text-center text-[#666666] py-8">
            다른 수료생 이야기가 없습니다.
          </p>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1 text-[#666666] hover:text-[#2563EB] disabled:opacity-50 disabled:hover:text-[#666666] transition-colors"
            aria-label="이전 페이지"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }).map((_, i) => (
              <button
                key={`page-${i + 1}`}
                type="button"
                onClick={() => setCurrentPage(i + 1)}
                className={`w-8 h-8 rounded-full text-sm font-medium transition-colors ${
                  currentPage === i + 1
                    ? "bg-[#2563EB] text-white"
                    : "text-[#666666] hover:bg-gray-100"
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="p-1 text-[#666666] hover:text-[#2563EB] disabled:opacity-50 disabled:hover:text-[#666666] transition-colors"
            aria-label="다음 페이지"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}
    </div>
  );
}
