/**
 * 지원서 양식 상세 및 질문 편집 페이지
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { 
  applicationForms, 
  applicationQuestions, 
  applicationQuestionOptions, 
  cohorts 
} from "@/lib/db/schema";
import { FormSettings } from "../_components/form-settings";
import { FormBuilder } from "./_components/form-builder";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminApplicationFormDetailPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  // 1. 양식 마스터 정보 조회
  const form = await db.query.applicationForms.findFirst({
    where: eq(applicationForms.id, id),
  });

  if (!form) {
    notFound();
  }

  // 2. 기수 목록 조회 (기본 설정용)
  const cohortList = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(asc(cohorts.order));

  // 3. 질문 및 선택지 조회
  const questionsData = await db.query.applicationQuestions.findMany({
    where: eq(applicationQuestions.formId, id),
    orderBy: [asc(applicationQuestions.order)],
    with: {
      options: {
        orderBy: [asc(applicationQuestionOptions.order)],
      },
    },
  });

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 py-6 sm:py-10 space-y-10">
      <div>
        <Link 
          href="/admin/application-forms" 
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-2"
        >
          <ChevronLeft className="size-4" />
          양식 목록으로 돌아가기
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">지원서 양식 편집</h1>
        <p className="mt-1 text-sm text-slate-500">
          양식의 기본 정보와 질문 항목을 관리합니다.
        </p>
      </div>

      <div className="space-y-12">
        {/* 기본 설정 섹션 */}
        <div className="space-y-4">
          <h2 className="text-lg font-medium text-slate-900">기본 설정</h2>
          <FormSettings form={form} cohorts={cohortList} />
        </div>

        {/* 질문 빌더 섹션 */}
        <FormBuilder
          formId={id}
          formTitle={form.title}
          initialQuestions={questionsData.map(q => ({
            ...q,
            options: q.options || [],
          }))}
        />
      </div>
    </section>
  );
}
