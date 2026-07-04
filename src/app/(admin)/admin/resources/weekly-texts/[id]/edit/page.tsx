/**
 * 주차별 텍스트 수정 페이지
 *
 * 역할: 관리자가 기존 주차별 텍스트를 수정하는 페이지
 * - URL의 id 파라미터로 항목 조회 후 폼에 기존 값 미리 채우기
 * - 마크다운 항목: 본문 직접 편집 가능
 * - 파일 항목: 새 파일 업로드로 교체 또는 메타데이터만 수정
 */

import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { WeeklyTextEditForm } from "@/app/(admin)/admin/resources/weekly-texts/_components/weekly-text-edit-form";
import { updateWeeklyText } from "@/features/weekly-texts/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts, weeklyTexts } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

// 날짜를 HTML input[type="date"] 형식으로 변환 (YYYY-MM-DD)
const toDateInputValue = (value: Date | null) =>
  value ? value.toISOString().slice(0, 10) : "";

export default async function WeeklyTextEditPage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;

  // 🛡️ route id 를 DB 조회 전에 UUID 형식으로 검증합니다 (#70).
  // raw string 이 DB 로 흘러가면 Postgres 캐스팅 에러의 context 로 새어나가므로 사전 차단합니다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">
            잘못된 요청입니다.
          </CardContent>
        </Card>
      </section>
    );
  }
  const validId = parsedId.data;

  const { row, cohortRows, hasDbError } = await (async () => {
    try {
      const [row] = await db
        .select({
          id: weeklyTexts.id,
          title: weeklyTexts.title,
          body: weeklyTexts.body,
          fileUrl: weeklyTexts.fileUrl,
          fileName: weeklyTexts.fileName,
          cohortId: weeklyTexts.cohortId,
          textType: weeklyTexts.textType,
          classDate: weeklyTexts.classDate,
        })
        .from(weeklyTexts)
        .where(eq(weeklyTexts.id, validId))
        .limit(1);

      const cohortRows = await db
        .select({ id: cohorts.id, name: cohorts.name })
        .from(cohorts)
        .orderBy(desc(sql<number>`CAST(regexp_replace(${cohorts.name}, '[^0-9]', '', 'g') AS INTEGER)`));

      return { row, cohortRows, hasDbError: false };
    } catch (error) {
      logServerError("admin/resources/weekly-texts/edit", error, { id: validId });
      return { row: null, cohortRows: [], hasDbError: true };
    }
  })();

  if (hasDbError) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">데이터를 불러오지 못했습니다.</p>
        </div>
      </section>
    );
  }

  if (!row) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">
            주차별 텍스트를 찾을 수 없습니다.
          </CardContent>
        </Card>
      </section>
    );
  }

  const action = updateWeeklyText.bind(null, row.id);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">주차별 텍스트 수정</h1>
        <Button variant="outline" render={<Link href="/admin/resources/weekly-texts" />}>
          목록으로
        </Button>
      </div>
      <WeeklyTextEditForm
        action={action}
        cohorts={cohortRows}
        defaultValues={{
          title: row.title,
          body: row.body ?? "",
          fileName: row.fileName ?? null,
          cohortId: row.cohortId ?? "",
          textType: row.textType ?? "",
          classDate: toDateInputValue(row.classDate),
          isMarkdown: !!row.body,
        }}
      />
    </section>
  );
}
