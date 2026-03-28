/**
 * 공지사항 상세 페이지 (src/app/(public)/notices/[id]/page.tsx)
 * 
 * 특정 공지사항 1개를 상세하게 보여주는 페이지입니다.
 * [id]는 URL의 동적 부분으로, 각 공지사항마다 다른 페이지가 생김
 * 예: /notices/1, /notices/2, /notices/3 등
 * - 공지사항 제목, 내용, 작성자, 작성일 표시
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, User } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { notices, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

/**
 * 동적 라우트의 타입 정의
 * params: Promise<{ id: string }> → URL에서 받은 id 값
 * 예: /notices/abc123 → params.id = "abc123"
 */
type NoticePageProps = {
  params: Promise<{ id: string }>;
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

/**
 * 서버에서 공지사항 데이터를 가져오는 함수
 * - notices 테이블에서 주어진 id의 공지사항을 검색
 * - users 테이블과 join해서 작성자 정보도 가져옴
 * - 발행된(PUBLISHED) 공지사항만 조회
 * 
 * @param id 공지사항 ID
 * @returns 공지사항 데이터 또는 null
 */
const getNotice = async (id: string) => {
   const rows = await db
     .select({
       id: notices.id,
       title: notices.title,
       content: notices.content,
       createdAt: notices.createdAt,
       authorName: users.name,
     })
     .from(notices)
     .innerJoin(users, eq(users.id, notices.authorId))
     .where(and(eq(notices.id, id), eq(notices.status, "PUBLISHED")))
     .limit(1);

   return rows[0] ?? null;
};

/**
 * SEO 최적화: 페이지 메타데이터 동적 생성
 * 공지사항 제목을 페이지 제목으로 설정해서 검색엔진과 브라우저에 표시
 * 공지사항이 없으면 기본 제목 "공지사항" 사용
 */
export async function generateMetadata({ params }: NoticePageProps): Promise<Metadata> {
   const { id } = await params;
   const notice = await getNotice(id);

   if (!notice) {
     return { title: "공지사항" };
   }

   return {
     title: notice.title,
   };
 }

export default async function NoticeDetailPage({ params }: NoticePageProps) {
   /**
    * URL의 동적 부분 [id]에서 id 값을 추출
    * 예: /notices/abc123 → id = "abc123"
    */
   const { id } = await params;
   const notice = await getNotice(id);

   /**
    * 공지사항이 없으면 404 페이지 표시
    * (존재하지 않거나 발행되지 않은 공지사항)
    */
   if (!notice) {
     notFound();
   }

   return (
     <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
       {/* 뒤로 가기 버튼 */}
       <div className="mb-8">
         <Link href="/notices">
           <Button variant="ghost" className="text-zinc-200 hover:bg-zinc-900 hover:text-white">
             <ArrowLeft className="size-4" />
             공지사항으로 돌아가기
           </Button>
         </Link>
       </div>

       {/* 공지사항 상세 내용 카드 */}
       <Card className="border-white/10 bg-zinc-950/80 py-0">
         {/* 공지사항 제목, 작성자, 작성일 표시 */}
          <CardHeader className="border-b border-white/10 py-6 sm:py-8">
            <CardTitle className="text-xl sm:text-2xl md:text-3xl font-semibold text-white">
             {notice.title}
           </CardTitle>
           {/* 공지사항 메타정보: 작성일, 작성자 */}
           <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 md:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {formatDate(notice.createdAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" />
              {notice.authorName}
            </span>
          </div>
         </CardHeader>
         {/* 공지사항 본문 내용 (HTML로 렌더링) */}
          <CardContent className="py-6 sm:py-10">
          <iframe
            title="공지사항 내용"
            srcDoc={`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{margin:0;background:#09090b;color:#f4f4f5;font-family:var(--font-geist-sans),sans-serif;line-height:1.75}a{color:#67e8f9}img{max-width:100%;height:auto;border-radius:12px}h1,h2,h3,h4,h5,h6{margin:0 0 12px;color:#fff}p{margin:0 0 14px;color:#e4e4e7}</style></head><body>${notice.content}</body></html>`}
            className="h-[300px] sm:h-[420px] md:h-[520px] w-full rounded-xl border border-white/10 bg-zinc-950"
          />
        </CardContent>
      </Card>
    </div>
  );
}
