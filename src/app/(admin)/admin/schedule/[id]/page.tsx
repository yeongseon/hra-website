/**
 * 일정 수정 페이지
 *
 * 역할: 기존 일정 데이터를 조회해 폼에 defaultValues로 전달
 * 사용 위치: /admin/schedule/[id]
 */

import { notFound } from "next/navigation";
import { asc } from "drizzle-orm";
import { z } from "zod/v4";
import { ScheduleForm } from "@/app/(admin)/admin/schedule/_components/schedule-form";
import { getScheduleEvent, updateScheduleEvent } from "@/features/schedule/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts, faculty } from "@/lib/db/schema";

export const metadata = { title: "일정 수정" };
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditSchedulePage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const event = await getScheduleEvent(parsedId.data);

  if (!event) notFound();

  const faculties = await db.select().from(faculty).orderBy(asc(faculty.name));
  const cohortsData = await db.select().from(cohorts).orderBy(asc(cohorts.order));

  // eventDate timestamp → 날짜("YYYY-MM-DD")와 시작 시간("HH:MM") 분리
  const isoStr = event.eventDate.toISOString();
  const eventDateStr = isoStr.slice(0, 10);  // "YYYY-MM-DD"
  const startTimeStr = isoStr.slice(11, 16); // "HH:MM"

  return (
    <ScheduleForm
      title="일정 수정"
      submitLabel="저장"
      // updateScheduleEvent는 id를 첫 번째 인자로 받으므로 bind로 고정
      action={updateScheduleEvent.bind(null, parsedId.data)}
      faculties={faculties}
      cohorts={cohortsData}
      defaultValues={{
        eventDate: eventDateStr,
        startTime: startTimeStr,
        endTime: event.endTime ?? null,
        eventType: event.eventType,
        title: event.title,
        cohortId: event.cohortId ?? null,
        weekNumber: event.weekNumber ?? null,
        description: event.description ?? null,
        isPublic: event.isPublic,
        sessions: event.sessions.map((s) => ({
          category: s.category,
          facultyId: s.facultyId ?? null,
          content: s.content ?? null,
          reportCategory: s.reportCategory ?? null,
          subTitle: s.subTitle ?? null,
          subDescription: s.subDescription ?? null,
          order: s.order,
        })),
      }}
    />
  );
}
