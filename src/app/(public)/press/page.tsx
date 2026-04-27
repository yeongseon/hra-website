/**
 * 공개 언론보도 페이지입니다.
 * 카드 형태가 아니라 단순 게시판(목록) 형태로 표시합니다.
 * - 데스크톱: 번호 / 제목 / 매체 / 날짜 4열 테이블
 * - 모바일: 제목과 매체·날짜를 세로로 적층
 * 행 전체가 외부 기사 링크로 동작하며 새 탭에서 열립니다.
 */

import type { Metadata } from "next";
import { asc, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { pressArticles } from "@/lib/db/schema";
import { PressLink } from "./_components/press-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "언론보도",
  description: "HRA의 활동과 비전이 다양한 언론 매체를 통해 어떻게 소개되었는지 확인해보세요.",
};

// 게시판에 표시할 날짜 형식 (예: 2025.04.26)
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(value)
    .replace(/\.\s?$/, "")
    .replace(/\.\s/g, ".");

export default async function PressPage() {
  const articles = await db
    .select()
    .from(pressArticles)
    .orderBy(asc(pressArticles.order), desc(pressArticles.publishedAt));

  // 게시판 번호는 최신순(상단)부터 큰 번호 부여
  const totalCount = articles.length;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          HRA PRESS
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
          언론보도
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          HRA가 소개된 언론보도를 모아보았습니다. 다양한 매체에서 전한 HRA의 이야기와 주요 소식을 확인해보세요.
        </p>
      </section>

      {articles.length === 0 ? (
        <div className="rounded-lg border border-[#D9D9D9] bg-white px-6 py-16 text-center text-base text-[#666666]">
          등록된 언론보도가 없습니다
        </div>
      ) : (
        <section
          aria-label="언론보도 목록"
          className="overflow-hidden rounded-lg border border-[#D9D9D9] bg-white"
        >
          {/* 데스크톱용 헤더 행 (모바일에서는 숨김) */}
          <div className="hidden border-b border-[#D9D9D9] bg-[#F5F5F5] md:grid md:grid-cols-[80px_1fr_180px_100px_140px] md:items-center md:px-6 md:py-3">
            <span className="text-sm font-semibold text-[#666666]">번호</span>
            <span className="text-sm font-semibold text-[#666666]">제목</span>
            <span className="text-sm font-semibold text-[#666666]">매체</span>
            <span className="text-center text-sm font-semibold text-[#666666]">조회</span>
            <span className="text-right text-sm font-semibold text-[#666666]">날짜</span>
          </div>

          <ul className="divide-y divide-[#D9D9D9]">
            {articles.map((article, index) => {
              // 최신 항목이 가장 큰 번호를 갖도록 (게시판 일반 규칙)
              const number = totalCount - index;
              return (
                <li key={article.id}>
                  <PressLink
                    articleId={article.id}
                    href={article.url}
                    className="block px-4 py-4 transition-colors hover:bg-[#F5F5F5] md:grid md:grid-cols-[80px_1fr_180px_100px_140px] md:items-center md:gap-4 md:px-6 md:py-4"
                  >
                    {/* 번호 (모바일 숨김) */}
                    <span className="hidden text-sm text-[#666666] md:block">{number}</span>

                    {/* 제목 */}
                    <span className="block text-base font-medium text-[#1a1a1a] hover:text-[#2563EB] md:truncate">
                      {article.title}
                    </span>

                    {/* 매체와 날짜 — 모바일에서는 한 줄로, 데스크톱에서는 별도 컬럼으로 */}
                    <span className="mt-1 block text-sm text-[#666666] md:mt-0 md:hidden">
                      {article.source} · {formatDate(article.publishedAt)}
                    </span>
                    <span className="hidden text-sm text-[#666666] md:block md:truncate">
                      {article.source}
                    </span>
                    <span className="hidden text-center text-sm text-[#666666] md:block">
                      {article.viewCount}
                    </span>
                    <span className="hidden text-right text-sm text-[#666666] md:block">
                      {formatDate(article.publishedAt)}
                    </span>
                  </PressLink>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
