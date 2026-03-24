/**
 * 기수 수정 페이지
 *
 * 역할: 관리자가 기존 기수의 정보를 수정할 수 있는 페이지
 * - URL의 id 파라미터로 기수 조회
 * - 수정 폼에 기존 데이터 미리 채우기
 * - 수정 완료 시 DB에 업데이트
 */

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

// 날짜를 HTML input[type="date"] 형식으로 변환 (YYYY-MM-DD)
const formatDateForInput = (date: Date | null) => {
  if (!date) return "";
  return date.toISOString().split("T")[0];
};

export default async function EditCohortPage({ params }: EditCohortPageProps) {
  // 🔒 관리자 권한 확인
  await requireAdmin();

  const { id } = await params;

  // 📊 DB에서 특정 기수 조회 - 수정할 데이터
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
