import type { Metadata } from "next";
import Link from "next/link";
import { Pin, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { getAllNotices } from "@/lib/content/notices";

export const metadata: Metadata = {
  title: "공지사항",
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export default async function NoticesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const query = params.q ?? "";

  let notices = await getAllNotices();
  
  if (query) {
    notices = notices.filter((n) =>
      n.title.toLowerCase().includes(query.toLowerCase())
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 flex flex-col sm:flex-row sm:items-end justify-between gap-6">
        <div className="space-y-4">
          <Badge
            variant="outline"
            className="border-blue-300 bg-blue-50 text-blue-700"
          >
            HRA NOTICE
          </Badge>
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
            공지사항
          </h1>
          <p className="max-w-2xl text-sm text-[#666666] md:text-base">
            HRA의 최신 소식과 중요 공지를 확인하세요.
          </p>
        </div>

        <form action="/notices" method="GET" className="relative w-full sm:w-72">
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="공지사항 검색..."
            className="w-full rounded-full border border-[#D9D9D9] bg-white px-4 py-2.5 pr-11 text-sm outline-none transition-colors hover:border-blue-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-[#1a1a1a] placeholder:text-[#666666]"
          />
          <button
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#666666] hover:text-[#1a1a1a] transition-colors"
          >
            <Search className="size-4" />
          </button>
        </form>
      </section>

      {notices.length === 0 ? (
        <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
          <CardContent className="text-center text-base text-[#666666]">
            {query ? "검색 결과가 없습니다" : "공지사항이 없습니다"}
          </CardContent>
        </Card>
      ) : (
        <div className="w-full rounded-xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] overflow-hidden">
          <div className="flex items-center bg-gray-50 border-b border-[#D9D9D9] py-3.5 px-4 text-sm font-medium text-[#666666]">
            <div className="w-16 text-center shrink-0">번호</div>
            <div className="flex-1 text-center">제목</div>
            <div className="w-24 text-center shrink-0 hidden md:block">작성자</div>
            <div className="w-28 text-center shrink-0">작성일</div>
            <div className="w-16 text-center shrink-0 hidden md:block">조회수</div>
          </div>
          
          <div className="flex flex-col">
            {notices.map((notice, index) => {
              const num = notices.length - index;
              return (
                <Link
                  key={notice.slug}
                  href={`/notices/${notice.slug}`}
                  className="group flex flex-col sm:flex-row sm:items-center border-b border-[#D9D9D9] last:border-b-0 py-3.5 px-4 transition-colors hover:bg-gray-50 text-sm"
                >
                  <div className="hidden sm:block w-16 text-center text-[#666666] shrink-0">
                    {num}
                  </div>
                  
                  <div className="flex-1 text-left sm:px-4 flex flex-col sm:flex-row sm:items-center gap-2 overflow-hidden mb-2 sm:mb-0">
                    <div className="flex items-center gap-2 max-w-full">
                      {notice.pinned && (
                        <Badge className="border border-blue-300 bg-blue-50 text-blue-700 shrink-0 px-1.5 py-0 text-[10px] h-5 hover:bg-blue-50">
                          <Pin className="size-3 mr-1" />
                          고정
                        </Badge>
                      )}
                      <span className="truncate text-[#1a1a1a] font-medium group-hover:text-blue-600 transition-colors">
                        {notice.title}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center text-xs sm:text-sm text-[#666666] sm:text-[#666666]">
                    <div className="w-24 text-center shrink-0 hidden md:block">
                      관리자
                    </div>
                    <div className="w-auto sm:w-28 text-left sm:text-center shrink-0">
                      {formatDate(notice.createdAt)}
                    </div>
                    <div className="w-16 text-center shrink-0 hidden md:block">
                      -
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
