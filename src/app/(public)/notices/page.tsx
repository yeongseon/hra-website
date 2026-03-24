import type { Metadata } from "next";
import Link from "next/link";
import { CalendarDays, Eye, Pin, ChevronRight } from "lucide-react";
import { eq, desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공지사항",
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function NoticesPage() {
  const publishedNotices = await db
    .select()
    .from(notices)
    .where(eq(notices.status, "PUBLISHED"))
    .orderBy(desc(notices.createdAt));

  const orderedNotices = [...publishedNotices].sort(
    (a, b) => Number(b.pinned) - Number(a.pinned)
  );

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
      <section className="mb-14 space-y-4">
        <Badge
          variant="outline"
          className="border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
        >
          HRA NOTICE
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
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
        <div className="space-y-4">
          {orderedNotices.map((notice) => (
            <Link key={notice.id} href={`/notices/${notice.id}`}>
              <Card className="border-white/10 bg-zinc-950/80 py-0 transition-colors hover:border-cyan-400/60 hover:bg-zinc-900/90">
                <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-2">
                    {notice.pinned ? (
                      <Badge className="bg-cyan-500/20 text-cyan-100">
                        <Pin className="size-3" />
                        고정
                      </Badge>
                    ) : null}
                    <h2 className="line-clamp-1 text-lg font-medium text-white md:text-xl">
                      {notice.title}
                    </h2>
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
