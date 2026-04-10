import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { weeklyTexts } from "@/lib/db/schema";
import { desc } from "drizzle-orm";

export const metadata: Metadata = {
  title: "주차별 텍스트",
};

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function WeeklyTextsPage() {
  const texts = await db
    .select()
    .from(weeklyTexts)
    .orderBy(desc(weeklyTexts.createdAt));

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
          주차별 텍스트
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base mx-auto sm:mx-0">
          수업에 필요한 주차별 텍스트 자료를 제공합니다.
        </p>
      </section>

      <section>
        <div className="mb-6 sm:mb-8 flex items-center justify-between gap-4">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#1a1a1a]">전체 목록</h2>
          <Badge variant="outline" className="border-[#D9D9D9] bg-white text-[#666666]">
            {texts.length}개
          </Badge>
        </div>

        {texts.length === 0 ? (
          <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
            <CardContent className="text-center text-base text-[#666666]">
              등록된 주차별 텍스트가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {texts.map((text) => (
              <a key={text.id} href={text.fileUrl} download={text.fileName} className="block">
                <Card className="border-[#D9D9D9] bg-white text-[#1a1a1a] shadow-[var(--shadow-soft)] rounded-2xl transition hover:border-blue-400 hover:bg-gray-50">
                  <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-2">
                      <Badge variant="secondary" className="w-fit border border-[#D9D9D9] bg-gray-50 text-[#666666]">
                        {formatDate(text.createdAt)}
                      </Badge>
                      <CardTitle className="text-lg">{text.title}</CardTitle>
                      <CardDescription className="text-sm text-[#666666]">
                        파일을 눌러 바로 다운로드하세요.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                      <Download className="size-4" />
                      다운로드
                    </div>
                  </CardHeader>
                </Card>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
