/**
 * 새 일정 등록 페이지
 *
 * 역할: 일정 등록 폼 렌더링, 교수진·기수 목록을 서버에서 조회해 폼에 전달
 * 사용 위치: /admin/schedule/new
 */

import { asc } from "drizzle-orm";
import { ScheduleForm } from "@/app/(admin)/admin/schedule/_components/schedule-form";
import { createScheduleEvent } from "@/features/schedule/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts, faculty } from "@/lib/db/schema";

export const metadata = { title: "일정 등록" };
export const dynamic = "force-dynamic";

export default async function NewSchedulePage() {
  await requireAdmin();

  // 세션 슬롯의 교수/강사 선택 목록
  const faculties = await db.select().from(faculty).orderBy(asc(faculty.name));
  // 관련 기수 선택 목록 (최신 기수 먼저)
  const cohortsData = await db.select().from(cohorts).orderBy(asc(cohorts.order));

  return (
    <ScheduleForm
      title="새 일정 등록"
      submitLabel="등록"
      action={createScheduleEvent}
      faculties={faculties}
      cohorts={cohortsData}
    />
  );
}
