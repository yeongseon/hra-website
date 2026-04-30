/**
 * 수업일지 수정 페이지
 *
 * 역할: 관리자가 기존 수업일지를 수정할 수 있는 페이지
 * - URL의 id 파라미터로 수업일지 조회
 * - 수정 폼에 기존 데이터 미리 채우기
 * - 수정 완료 시 DB에 업데이트
 */

import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClassLogForm } from "@/app/(admin)/admin/resources/_components/class-log-form";
import { updateClassLog } from "@/features/class-logs/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { classLogImages, classLogs, cohorts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type ClassLogEditPageProps = {
  params: Promise<{ id: string }>;
};

// 날짜를 HTML input[type="date"] 형식으로 변환 (YYYY-MM-DD)
const toDateInputValue = (value: Date) => {
  return value.toISOString().slice(0, 10);
};

export default async function ClassLogEditPage({ params }: ClassLogEditPageProps) {
  // 🔒 관리자 권한 확인
  await requireAdmin();

  const { id } = await params;

  // 데이터 조회와 오류 처리를 렌더 바깥에서 마무리해 React lint 규칙을 지킵니다.
  const { log, cohortRows, existingImageCount, hasDbError } = await (async () => {
    try {
      const [log] = await db
        .select({
          id: classLogs.id,
          title: classLogs.title,
          content: classLogs.content,
          classDate: classLogs.classDate,
          cohortId: classLogs.cohortId,
        })
        .from(classLogs)
        .where(eq(classLogs.id, id))
        .limit(1);

      const cohortRows = await db
        .select({ id: cohorts.id, name: cohorts.name })
        .from(cohorts)
        .orderBy(asc(cohorts.order), asc(cohorts.name));

      const imageRows = await db
        .select({ id: classLogImages.id })
        .from(classLogImages)
        .where(eq(classLogImages.classLogId, id));

      return { log, cohortRows, existingImageCount: imageRows.length, hasDbError: false };
    } catch (error) {
      console.error("[admin/resources/edit] DB 조회 오류:", error);
      return { log: null, cohortRows: [], existingImageCount: 0, hasDbError: true };
    }
  })();

  if (hasDbError) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">데이터를 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs text-red-600">데이터베이스 연결을 확인해 주세요.</p>
        </div>
      </section>
    );
  }

  if (!log) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">
            수업일지를 찾을 수 없습니다.
          </CardContent>
        </Card>
      </section>
    );
  }

  const action = updateClassLog.bind(null, log.id);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">수업일지 수정</h1>
        <Button variant="outline" render={<Link href="/admin/resources" />}>
          목록으로
        </Button>
      </div>
      <ClassLogForm
        action={action}
        cohorts={cohortRows}
        defaultValues={{
          title: log.title,
          content: log.content,
          classDate: toDateInputValue(log.classDate),
          cohortId: log.cohortId,
          existingImageCount,
        }}
        submitLabel="수정 저장"
        successMessage="수업일지가 수정되었습니다."
      />
    </section>
  );
}
