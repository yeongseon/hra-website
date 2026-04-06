import type { Metadata } from "next";
import Link from "next/link";
import { BookMarked, BookOpen, FileText, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogs, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const metadata: Metadata = {
  title: "자료실",
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
    .replace(/^#{1,6}\s+/gm, "")        // headings
    .replace(/\*\*(.+?)\*\*/g, "$1")     // bold
    .replace(/__(.+?)__/g, "$1")          // bold alt
    .replace(/\*(.+?)\*/g, "$1")          // italic
    .replace(/_(.+?)_/g, "$1")            // italic alt
    .replace(/~~(.+?)~~/g, "$1")          // strikethrough
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1") // inline code
    .replace(/!\[.*?\]\(.*?\)/g, "")      // images
    .replace(/\[(.+?)\]\(.*?\)/g, "$1")   // links
    .replace(/^\s*[-*+]\s+/gm, "")        // unordered list
    .replace(/^\s*\d+\.\s+/gm, "")        // ordered list
    .replace(/^\s*>\s?/gm, "")            // blockquote
    .replace(/^---+$/gm, "")              // hr
    .replace(/\n{2,}/g, " ")              // double newlines
    .replace(/\n/g, " ");                 // single newlines

const getExcerpt = (value: string, length = 120) => {
  const normalized = stripMarkdown(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= length) {
    return normalized;
  }
  return `${normalized.slice(0, length)}...`;
};

export default async function ResourcesPage() {
  const logs = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      createdAt: classLogs.createdAt,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 space-y-4 text-center sm:text-left">
        <Badge
          variant="outline"
          className="border-amber-300 bg-amber-50 text-amber-700"
        >
          HRA RESOURCES
        </Badge>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-[#1a1a1a]">
          자료실
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base mx-auto sm:mx-0">
          수업일지, 주차별 텍스트, 가이드북 등 HRA 교육 자료를 확인하세요.
        </p>
      </section>

      <section className="mb-12">
        <div className="relative overflow-hidden rounded-2xl bg-amber-50 border border-amber-200 p-6 md:p-8 shadow-[var(--shadow-soft)]">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
          <div className="flex items-start sm:items-center gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center border border-amber-200">
              <Info className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-amber-800 mb-1">열람 권한 안내</h3>
              <p className="text-[#666666] text-sm md:text-base leading-relaxed">
                자료실은 수료생, 교수진, 운영진 등 내부 회원만 열람할 수 있습니다. 로그인 후 이용해 주세요.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="group relative overflow-hidden border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl transition-all duration-300 hover:border-blue-400 hover:bg-gray-50">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative pb-4 pt-8 px-8">
            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-[#D9D9D9] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <FileText className="w-6 h-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl font-bold text-[#1a1a1a]">수업일지</CardTitle>
          </CardHeader>
          <CardContent className="relative px-8 pb-8">
            <p className="text-[#666666] text-sm leading-relaxed">
              매주 진행되는 HRA 수업의 주요 내용과 토론 결과를 확인할 수 있습니다.
            </p>
            <p className="mt-3 text-xs text-[#666666]">현재 {logs.length}개의 수업일지가 등록되어 있습니다.</p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl transition-all duration-300 hover:border-blue-400 hover:bg-gray-50">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative pb-4 pt-8 px-8">
            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-[#D9D9D9] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <BookOpen className="w-6 h-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl font-bold text-[#1a1a1a]">주차별 텍스트</CardTitle>
          </CardHeader>
          <CardContent className="relative px-8 pb-8">
            <p className="text-[#666666] text-sm leading-relaxed">준비 중입니다.</p>
          </CardContent>
        </Card>

        <Card className="group relative overflow-hidden border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl transition-all duration-300 hover:border-blue-400 hover:bg-gray-50">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <CardHeader className="relative pb-4 pt-8 px-8">
            <div className="w-12 h-12 rounded-xl bg-gray-50 border border-[#D9D9D9] flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
              <BookMarked className="w-6 h-6 text-amber-600" />
            </div>
            <CardTitle className="text-xl font-bold text-[#1a1a1a]">가이드북</CardTitle>
          </CardHeader>
          <CardContent className="relative px-8 pb-8">
            <p className="text-[#666666] text-sm leading-relaxed">준비 중입니다.</p>
          </CardContent>
        </Card>
      </section>

      <section className="mt-10 sm:mt-14">
        <div className="mb-6 sm:mb-8 flex items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1a1a1a]">수업일지</h2>
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
