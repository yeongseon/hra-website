/**
 * 새 보고서 양식·가이드 작성 페이지
 *
 * 역할: 관리자가 신규 양식 또는 가이드 문서를 등록하는 진입점.
 */

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { TemplateForm } from "@/app/(admin)/admin/templates/_components/template-form";
import { createReportTemplate } from "@/features/report-templates/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewTemplatePage() {
  await requireAdmin();

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">
          새 양식/가이드 작성
        </h1>
        <Button variant="outline" render={<Link href="/admin/templates" />}>
          목록으로
        </Button>
      </div>
      <TemplateForm
        action={createReportTemplate}
        submitLabel="양식 저장"
        successMessage="양식이 생성되었습니다."
      />
    </section>
  );
}
