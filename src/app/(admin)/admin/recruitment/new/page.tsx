/**
 * 새 기수 추가 페이지
 *
 * 역할: 관리자가 새로운 기수를 생성할 수 있는 페이지
 * - 기수 폼 컴포넌트 표시
 * - 기수 정보 입력 후 DB에 저장
 */

import { CohortForm } from "@/app/(admin)/admin/recruitment/_components/cohort-form";
import { createCohort } from "@/features/recruitment/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewCohortPage() {
  // 🔒 관리자 권한 확인
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
