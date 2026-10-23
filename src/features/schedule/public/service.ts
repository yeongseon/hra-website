/**
 * 공개 일정의 월 범위와 Web/API 표시 계약을 소유하는 Application Service입니다.
 * DB에 저장된 UTC 필드는 한국 달력의 벽시계 값이므로 실제 순간처럼 시간대를 변환하지 않습니다.
 */
import "server-only";

import { findPublicScheduleEvents, type PublicScheduleEvent, type PublicScheduleSession } from "./repository";

export type { PublicScheduleEvent, PublicScheduleSession } from "./repository";

export type SerializedScheduleEvent = {
  id: string;
  eventDate: string;
  eventType: PublicScheduleEvent["eventType"];
  title: string;
  weekNumber: number | null;
  description: string | null;
  cohort: PublicScheduleEvent["cohort"];
  sessions: PublicScheduleSession[];
};

export type ApiScheduleEvent = Omit<SerializedScheduleEvent, "eventDate"> & {
  calendarDate: string;
  startTime: string;
  endTime: string | null;
};

/** 연·월 오류를 DB 조회 전에 거부하고 기존 Date.UTC 월 경계로 공개 일정만 조회합니다. */
export async function listPublicScheduleMonth(year: number, month: number): Promise<PublicScheduleEvent[]> {
  if (!Number.isInteger(year) || year < 1900 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error("SCHEDULE_MONTH_INVALID");
  }

  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return findPublicScheduleEvents(startDate, endDate);
}

/** Web 클라이언트의 기존 ISO 문자열 구조를 그대로 만듭니다. */
export function serializePublicScheduleEvents(events: readonly PublicScheduleEvent[]): SerializedScheduleEvent[] {
  return events.map((event) => ({
    id: event.id,
    eventDate: event.eventDate.toISOString(),
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

/** 두 자리 벽시계 값을 만들 때 UTC 구성요소만 읽고 +9 변환은 하지 않습니다. */
function wallClockParts(value: Date): { calendarDate: string; startTime: string } {
  const twoDigits = (part: number) => String(part).padStart(2, "0");
  return {
    calendarDate: `${value.getUTCFullYear()}-${twoDigits(value.getUTCMonth() + 1)}-${twoDigits(value.getUTCDate())}`,
    startTime: `${twoDigits(value.getUTCHours())}:${twoDigits(value.getUTCMinutes())}`,
  };
}

/** API v1에는 실제 UTC 순간 대신 한국 달력의 날짜·시각 문자열을 반환합니다. */
export async function listPublicScheduleApiMonth(year: number, month: number): Promise<{
  year: number;
  month: number;
  timeZone: "Asia/Seoul";
  events: ApiScheduleEvent[];
}> {
  const events = await listPublicScheduleMonth(year, month);
  return {
    year,
    month,
    timeZone: "Asia/Seoul",
    events: events.map((event) => ({
      id: event.id,
      ...wallClockParts(event.eventDate),
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
    })),
  };
}
