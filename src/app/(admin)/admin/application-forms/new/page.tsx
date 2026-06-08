/**
 * 지원서 양식 생성 페이지
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { FormSettings } from "../_components/form-settings";

export default async function AdminNewApplicationFormPage() {
  await requireAdmin();

  // 기수 목록 조회 (드롭다운용)
  const cohortList = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(asc(cohorts.order));

  return (
    <section className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-6">
        <Link 
          href="/admin/application-forms" 
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-2"
        >
          <ChevronLeft className="size-4" />
          양식 목록으로 돌아가기
        </Link>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">새 지원서 양식 만들기</h1>
        <p className="mt-1 text-sm text-slate-500">
          모집 기수를 지정하고 지원서의 기본 정보를 입력하세요.
        </p>
      </div>

      <FormSettings cohorts={cohortList} />
    </section>
  );
}
