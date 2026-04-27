import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogs, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "수업일지",
};

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const stripMarkdown = (value: string) =>
  value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.+?)\]\(.*?\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ");

const getExcerpt = (value: string, length = 120) => {
  const normalized = stripMarkdown(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= length) {
    return normalized;
  }
  return `${normalized.slice(0, length)}...`;
};

export default async function ClassLogsPage() {
  const logs = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      createdAt: classLogs.createdAt,
      viewCount: classLogs.viewCount,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link 
          href="/resources" 
          className="inline-flex items-center text-sm font-medium text-[#666666] hover:text-[#1a1a1a] transition-colors"
        >
          <ArrowLeft className="mr-2 size-4" />
          자료실
        </Link>
      </div>

      <section className="mb-10 sm:mb-14 space-y-4 text-center sm:text-left">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
          수업일지
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base mx-auto sm:mx-0">
          매주 진행되는 HRA 수업의 주요 내용과 토론 결과를 확인하세요.
        </p>
      </section>

      <section>
        <div className="mb-6 sm:mb-8 flex items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1a1a1a]">전체 목록</h2>
          <Badge variant="outline" className="border-[#D9D9D9] bg-white text-[#666666]">
            {logs.length}개
          </Badge>
        </div>

        {logs.length === 0 ? (
          <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
            <CardContent className="text-center text-base text-[#666666]">
              등록된 수업일지가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {logs.map((log) => (
              <Link key={log.id} href={`/resources/${log.id}`}>
                <Card className="h-full border-[#D9D9D9] bg-white text-[#1a1a1a] shadow-[var(--shadow-soft)] rounded-2xl transition hover:border-blue-400 hover:bg-gray-50">
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666]">
                      <Badge variant="secondary" className="border border-[#D9D9D9] bg-gray-50 text-[#666666]">
                        {formatDate(log.classDate)}
                      </Badge>
                      <span>{log.authorName}</span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3.5" />
                        조회 {log.viewCount}
                      </span>
                    </div>
                    <CardTitle className="line-clamp-2 text-lg">{log.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="line-clamp-3 text-sm leading-6 text-[#666666]">
                      {getExcerpt(log.content)}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
