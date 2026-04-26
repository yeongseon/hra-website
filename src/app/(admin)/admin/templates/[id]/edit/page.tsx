/**
 * 보고서 양식·가이드 편집 페이지
 *
 * 역할: 기존 양식의 메타와 본문(Markdown)을 수정하는 진입점.
 *       URL 파라미터 id로 DB에서 레코드를 조회하여 폼 기본값으로 주입한다.
 */

import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { TemplateForm } from "@/app/(admin)/admin/templates/_components/template-form";
import { updateReportTemplate } from "@/features/report-templates/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { reportTemplates } from "@/lib/db/schema";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditTemplatePage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const target = await db.query.reportTemplates.findFirst({
    where: eq(reportTemplates.id, id),
  });

  if (!target) {
    notFound();
  }

  const boundAction = async (formData: FormData) =>
    updateReportTemplate(target.id, formData);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">
          양식 편집
        </h1>
        <Button variant="outline" render={<Link href="/admin/templates" />}>
          목록으로
        </Button>
      </div>
      <TemplateForm
        action={boundAction}
        defaultValues={{
          slug: target.slug,
          title: target.title,
          category: target.category,
          reportCategory: target.reportCategory as
            | "management-book"
            | "classic-book"
            | "business-practice"
            | null,
          description: target.description,
          version: target.version,
          body: target.body,
          published: target.published,
          order: target.order,
        }}
        submitLabel="변경 저장"
      />
    </section>
  );
}
