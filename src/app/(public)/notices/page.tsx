import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Pin, ChevronRight } from "lucide-react";
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

export default async function NoticesPage() {
  const notices = await getAllNotices();

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 space-y-4">
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
      </section>

      {notices.length === 0 ? (
        <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
          <CardContent className="text-center text-base text-[#666666]">공지사항이 없습니다</CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {notices.map((notice) => (
            <Link key={notice.slug} href={`/notices/${notice.slug}`}>
              <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0 transition-colors hover:border-blue-400 hover:bg-gray-50">
                <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    {notice.pinned ? (
                      <Badge className="border border-blue-300 bg-blue-50 text-blue-700">
                        <Pin className="size-3" />
                        고정
                      </Badge>
                    ) : null}
                    <h2 className="line-clamp-1 text-lg font-medium text-[#1a1a1a] md:text-xl">{notice.title}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-[#666666] md:text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays className="size-3.5" />
                        {formatDate(notice.createdAt)}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="size-5 self-end text-[#666666] md:self-center" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
