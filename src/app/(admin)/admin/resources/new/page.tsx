/**
 * 새 수업일지 작성 페이지
 *
 * 역할: 관리자가 새로운 수업일지를 작성할 수 있는 페이지
 * - 수업일지 폼 컴포넌트 표시
 * - 기수 목록 조회 후 드롭다운에 표시
 * - 작성 완료 시 DB에 저장
 */

import Link from "next/link";
import { asc } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { ClassLogForm } from "@/app/(admin)/admin/resources/_components/class-log-form";
import { createClassLog } from "@/features/class-logs/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function NewClassLogPage() {
  // 🔒 관리자 권한 확인
  await requireAdmin();

  // 📊 DB에서 기수 목록 조회 - 폼의 드롭다운에 표시할 데이터
  const cohortRows = await db
    .select({ id: cohorts.id, name: cohorts.name })
    .from(cohorts)
    .orderBy(asc(cohorts.order), asc(cohorts.name));

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">새 수업일지 작성</h1>
        <Button variant="outline" render={<Link href="/admin/resources" />}>
          목록으로
        </Button>
      </div>
      <ClassLogForm
        action={createClassLog}
        cohorts={cohortRows}
        submitLabel="수업일지 저장"
        successMessage="수업일지가 생성되었습니다."
      />
    </section>
  );
}
