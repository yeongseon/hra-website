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

type NoticePageProps = {
  params: Promise<{ id: string }>;
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

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
  const { id } = await params;
  const notice = await getNotice(id);

  if (!notice) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
      <div className="mb-8">
        <Link href="/notices">
          <Button variant="ghost" className="text-zinc-200 hover:bg-zinc-900 hover:text-white">
            <ArrowLeft className="size-4" />
            공지사항으로 돌아가기
          </Button>
        </Link>
      </div>

      <Card className="border-white/10 bg-zinc-950/80 py-0">
        <CardHeader className="border-b border-white/10 py-8">
          <CardTitle className="text-2xl font-semibold text-white md:text-3xl">
            {notice.title}
          </CardTitle>
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
        <CardContent className="py-10">
          <iframe
            title="공지사항 내용"
            srcDoc={`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{margin:0;background:#09090b;color:#f4f4f5;font-family:var(--font-geist-sans),sans-serif;line-height:1.75}a{color:#67e8f9}img{max-width:100%;height:auto;border-radius:12px}h1,h2,h3,h4,h5,h6{margin:0 0 12px;color:#fff}p{margin:0 0 14px;color:#e4e4e7}</style></head><body>${notice.content}</body></html>`}
            className="h-[520px] w-full rounded-xl border border-white/10 bg-zinc-950"
          />
        </CardContent>
      </Card>
    </div>
  );
}
