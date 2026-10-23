/**
 * 공개 일정의 월별 PostgreSQL 조회를 소유합니다.
 * 이벤트·기수·세션·교수의 화면 표시 필드만 중첩 투영하고 비공개 운영 메타데이터를 읽지 않습니다.
 */
import "server-only";

import { and, asc, between, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { scheduleEvents, scheduleSessions } from "@/lib/db/schema";

export type PublicScheduleSession = {
  category: "CLASSICS" | "ENGLISH" | "SPEECH" | "SPECIAL_LECTURE" | "CASE_STUDY";
  content: string | null;
  reportCategory: string | null;
  subTitle: string | null;
  subDescription: string | null;
  faculty: { id: string; name: string } | null;
  order: number;
};

export type PublicScheduleEvent = {
  id: string;
  eventDate: Date;
  endTime: string | null;
  eventType: "CLASS" | "EVENT";
  title: string;
  weekNumber: number | null;
  description: string | null;
  cohort: { id: string; name: string } | null;
  sessions: PublicScheduleSession[];
};

/** 공개 표식과 입력받은 월 경계만 적용하고, 이벤트·세션의 기존 오름차순을 유지합니다. */
export async function findPublicScheduleEvents(
  startDate: Date,
  endDate: Date,
): Promise<PublicScheduleEvent[]> {
  const rows = await db.query.scheduleEvents.findMany({
    where: and(
      eq(scheduleEvents.isPublic, true),
      between(scheduleEvents.eventDate, startDate, endDate),
    ),
    columns: {
      id: true,
      eventDate: true,
      endTime: true,
      eventType: true,
      title: true,
      weekNumber: true,
      description: true,
    },
    with: {
      cohort: { columns: { id: true, name: true } },
      sessions: {
        columns: {
          category: true,
          content: true,
          reportCategory: true,
          subTitle: true,
          subDescription: true,
          order: true,
        },
        with: { faculty: { columns: { id: true, name: true } } },
        orderBy: [asc(scheduleSessions.order)],
      },
    },
    orderBy: [asc(scheduleEvents.eventDate)],
  });

  // 중첩 조회 결과도 명시적으로 재구성해 DB 행이 서비스 계약으로 그대로 전달되지 않게 합니다.
  return rows.map((event) => ({
    id: event.id,
    eventDate: event.eventDate,
    endTime: event.endTime,
    eventType: event.eventType,
    title: event.title,
    weekNumber: event.weekNumber,
    description: event.description,
    cohort: event.cohort ? { id: event.cohort.id, name: event.cohort.name } : null,
    sessions: event.sessions.map((session) => ({
      category: session.category,
      content: session.content,
      reportCategory: session.reportCategory,
      subTitle: session.subTitle,
      subDescription: session.subDescription,
      faculty: session.faculty ? { id: session.faculty.id, name: session.faculty.name } : null,
      order: session.order,
    })),
  }));
}
