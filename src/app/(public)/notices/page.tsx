/**
 * 공지사항 목록 페이지 (src/app/(public)/notices/page.tsx)
 * 
 * HRA의 모든 공지사항을 목록으로 보여주는 페이지입니다.
 * 서버 컴포넌트에서 DB에서 공지사항을 조회해서 표시합니다.
 * - 발행된(PUBLISHED) 공지사항만 표시
 * - 고정(pinned)된 공지사항이 맨 위에 표시
 * - 클릭하면 상세 페이지로 이동
 */

import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Eye, Pin, ChevronRight } from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * SEO 최적화: 이 페이지가 검색엔진에 어떻게 표시될지 설정
 * 페이지 제목은 "공지사항"으로 표시됨
 */
export const metadata: Metadata = {
  title: "공지사항",
};

/**
 * 날짜를 한국식 형식(yyyy.mm.dd)으로 변환하는 함수
 * 예: 2025-03-24 → 2025.03.24
 */
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function NoticesPage() {
  /**
   * 서버에서 데이터베이스 조회
   * notices 테이블에서 status가 "PUBLISHED"인 공지사항만 가져옴
   * 최신 공지사항이 먼저 나오도록 정렬
   */
  const publishedNotices = await db
     .select()
     .from(notices)
     .where(eq(notices.status, "PUBLISHED"))
     .orderBy(desc(notices.createdAt));

   /**
    * 고정(pinned)된 공지사항을 맨 위로 정렬
    * pinned가 true인 항목들이 false인 항목들보다 위로 올라옴
    */
   const orderedNotices = [...publishedNotices].sort(
     (a, b) => Number(b.pinned) - Number(a.pinned)
   );

   return (
     <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
       {/* 공지사항 페이지 헤더 */}
       <section className="mb-10 sm:mb-14 space-y-4">
        <Badge
          variant="outline"
          className="border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
        >
          HRA NOTICE
        </Badge>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-white">
          공지사항
        </h1>
        <p className="max-w-2xl text-sm text-zinc-400 md:text-base">
          HRA의 최신 소식과 중요 공지를 확인하세요.
        </p>
      </section>

       {orderedNotices.length === 0 ? (
         <Card className="border-white/10 bg-zinc-950/80 py-10">
           <CardContent className="text-center text-base text-zinc-300">
             공지사항이 없습니다
           </CardContent>
         </Card>
       ) : (
         /* 공지사항 목록을 세로로 표시 */
         <div className="space-y-4">
           {orderedNotices.map((notice) => (
             <Link key={notice.id} href={`/notices/${notice.id}`}>
               <Card className="border-white/10 bg-zinc-950/80 py-0 transition-colors hover:border-cyan-400/60 hover:bg-zinc-900/90">
                 <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
                   <div className="space-y-2">
                     {/* 고정된 공지사항에는 "고정" 배지 표시 */}
                     {notice.pinned ? (
                       <Badge className="bg-cyan-500/20 text-cyan-100">
                         <Pin className="size-3" />
                         고정
                       </Badge>
                     ) : null}
                     {/* 공지사항 제목 */}
                     <h2 className="line-clamp-1 text-lg font-medium text-white md:text-xl">
                     {notice.title}
                     </h2>
                     {/* 작성 날짜와 조회 수 표시 */}
                     <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 md:text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {formatDate(notice.createdAt)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Eye className="size-3.5" />
                        조회수 {notice.viewCount}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 self-end text-zinc-500 md:self-center" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
