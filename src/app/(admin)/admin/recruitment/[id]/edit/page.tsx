import Link from "next/link";
import { eq } from "drizzle-orm";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CohortForm } from "@/app/(admin)/admin/recruitment/_components/cohort-form";
import { updateCohort } from "@/features/recruitment/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type EditCohortPageProps = {
  params: Promise<{ id: string }>;
};

const formatDateForInput = (date: Date | null) => {
  if (!date) return "";
  return date.toISOString().split("T")[0];
};

export default async function EditCohortPage({ params }: EditCohortPageProps) {
  await requireAdmin();

  const { id } = await params;

  const [cohort] = await db
    .select()
    .from(cohorts)
    .where(eq(cohorts.id, id))
    .limit(1);

  if (!cohort) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white py-10 shadow-sm">
          <CardContent className="space-y-4 text-center">
            <p className="text-lg font-medium text-slate-900">기수를 찾을 수 없습니다.</p>
            <Link
              href="/admin/recruitment"
              className={buttonVariants({
                variant: "outline",
                className: "border-slate-200 text-slate-700",
              })}
            >
              기수 목록으로 돌아가기
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const updateAction = updateCohort.bind(null, id);

  return (
    <CohortForm
      title="기수 수정"
      description={`${cohort.name} 정보를 수정합니다.`}
      submitLabel="변경사항 저장"
      action={updateAction}
      defaultValues={{
        name: cohort.name,
        description: cohort.description,
        startDate: formatDateForInput(cohort.startDate),
        endDate: formatDateForInput(cohort.endDate),
        recruitmentStartDate: formatDateForInput(cohort.recruitmentStartDate),
        recruitmentEndDate: formatDateForInput(cohort.recruitmentEndDate),
        recruitmentStatus: cohort.recruitmentStatus,
        isActive: cohort.isActive,
        order: cohort.order,
      }}
    />
  );
}
