import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { TemplateForm } from "@/app/(admin)/admin/resources/templates/_components/template-form";
import { Button } from "@/components/ui/button";
import { updateReportTemplate } from "@/features/report-templates/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { reportTemplates } from "@/lib/db/schema";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditResourceTemplatePage({ params }: Props) {
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
        <Button variant="outline" render={<Link href="/admin/resources/templates" />}>
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
