/**
 * 사용자용 동적 지원서 작성 페이지
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { z } from "zod/v4";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { 
  applicationForms, 
  applicationQuestions, 
  applicationQuestionOptions 
} from "@/lib/db/schema";
import { PublicApplicationForm } from "./_components/public-application-form";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function PublicApplicationApplyPage({ params }: Props) {
  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  // 공개 페이지이므로 notFound() 로 안전하게 404 응답한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  // 1. 양식 마스터 정보 조회 (공개된 것만)
  const form = await db.query.applicationForms.findFirst({
    where: eq(applicationForms.id, parsedId.data),
  });

  if (!form || !form.isPublished) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20 md:py-32">
        <section className="mb-8 space-y-4 sm:mb-10 text-center sm:text-left">
          <Badge variant="outline" className="border-red-300 bg-red-50 text-red-700">
            지원 불가
          </Badge>
          <h1 className="text-3xl font-bold tracking-tight text-[#1a1a1a]">모집이 마감되었습니다</h1>
          <p className="max-w-2xl text-base text-[#666666]">
            현재 요청하신 지원서 양식은 더 이상 접수받지 않거나 비공개 상태입니다.
          </p>
        </section>
        <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
          <CardHeader className="border-b border-[#D9D9D9] py-8 text-center sm:text-left">
            <CardTitle className="text-xl text-[#1a1a1a]">모집 상태 안내</CardTitle>
          </CardHeader>
          <CardContent className="py-10 text-center sm:text-left">
            <p className="text-lg text-[#475569] mb-8">새로운 모집 소식은 홈페이지 공지사항을 확인해주세요.</p>
            <Link 
              href="/" 
              className="inline-flex items-center justify-center rounded-xl bg-slate-900 px-8 py-3 text-sm font-bold text-white transition-colors hover:bg-slate-700 shadow-lg shadow-slate-900/20"
            >
              메인으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 2. 질문 및 선택지 조회
  const questionsData = await db.query.applicationQuestions.findMany({
    where: eq(applicationQuestions.formId, parsedId.data),
    orderBy: [asc(applicationQuestions.order)],
    with: {
      options: {
        orderBy: [asc(applicationQuestionOptions.order)],
      },
    },
  });

  return (
    <div className="bg-[#F8FAFC] min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20 md:py-32">
        {/* 헤더 섹션 */}
        <section className="mb-12 space-y-4 animate-in fade-in slide-in-from-top-4 duration-700">
          <div className="flex items-center gap-3 mb-2">
            <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 px-3 py-1 font-bold">
              온라인 지원
            </Badge>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
            {form.title}
          </h1>
          {form.description && (
            <p className="max-w-2xl text-lg text-slate-500 leading-relaxed">
              {form.description}
            </p>
          )}
        </section>

        {/* 지원서 폼 */}
        <PublicApplicationForm 
          form={form} 
          questions={questionsData.map(q => ({
            ...q,
            options: q.options || [],
          }))} 
        />
      </div>
    </div>
  );
}
