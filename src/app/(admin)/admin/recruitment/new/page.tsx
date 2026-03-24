import { CohortForm } from "@/app/(admin)/admin/recruitment/_components/cohort-form";
import { createCohort } from "@/features/recruitment/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewCohortPage() {
  await requireAdmin();

  return (
    <CohortForm
      title="새 기수 추가"
      description="새로운 기수 정보를 입력하세요."
      submitLabel="기수 추가"
      action={createCohort}
    />
  );
}
