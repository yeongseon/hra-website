/**
 * 일정 관리 서버 액션
 *
 * 역할: scheduleEvents(이벤트) + scheduleSessions(세션) CRUD 처리
 * 사용 위치:
 *   - 관리자 페이지 (/admin/schedule): 일정 등록·수정·삭제
 *   - 메인 페이지 캘린더 섹션: 월별 공개 일정 조회
 *
 * 세션 전달 방식: 폼의 hidden input "sessionsJson"에 JSON 직렬화하여 전송
 *   이유: 동적 배열(세션 추가/삭제)을 FormData로 처리하기 어려워 JSON으로 일괄 전달
 */

"use server";

import { and, asc, between, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { scheduleEvents, scheduleSessions } from "@/lib/db/schema";

// ============================================================
// Zod 스키마 정의
// ============================================================

// 세션 슬롯 하나에 대한 유효성 검사
const sessionSchema = z.object({
  category: z.enum(["CLASSICS", "ENGLISH", "SPEECH", "SPECIAL_LECTURE", "CASE_STUDY"]),
  facultyId: z.string().uuid().optional().nullable(),
  content: z.string().trim().max(500).optional().nullable(),
  reportCategory: z.string().trim().max(50).optional().nullable(), // 케이스스터디 분야
  subTitle: z.string().trim().max(300).optional().nullable(),       // 케이스스터디 제목
  subDescription: z.string().trim().optional().nullable(),          // 케이스스터디 설명
  order: z.number().int().default(0),
});

// 이벤트 폼 전체 유효성 검사
const scheduleEventFormSchema = z.object({
  eventDate: z.string().trim().min(1, "날짜를 입력해주세요."),       // "YYYY-MM-DD"
  startTime: z.string().trim().min(1, "시작 시간을 입력해주세요."),  // "HH:MM"
  endTime: z.string().trim().optional().nullable(),                   // "HH:MM" (선택)
  eventType: z.enum(["CLASS", "EVENT"]),
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  cohortId: z.string().uuid().optional().nullable(),
  weekNumber: z.number().int().positive().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  isPublic: z.boolean().default(true),
  sessions: z.array(sessionSchema).default([]),
});

// 액션 반환 타입
export type ScheduleActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

// ============================================================
// 유틸리티 함수
// ============================================================

function normalizeText(value: FormDataEntryValue | null): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function parseBoolean(value: FormDataEntryValue | null): boolean {
  return value === "on" || value === "true";
}

function parseWeekNumber(value: FormDataEntryValue | null): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
}

function parseSessions(value: FormDataEntryValue | null): z.infer<typeof sessionSchema>[] {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function parseFormData(formData: FormData) {
  return scheduleEventFormSchema.safeParse({
    eventDate: normalizeText(formData.get("eventDate")),
    startTime: normalizeText(formData.get("startTime")),
    endTime: normalizeText(formData.get("endTime")) || null,
    eventType: normalizeText(formData.get("eventType")),
    title: normalizeText(formData.get("title")),
    cohortId: normalizeText(formData.get("cohortId")) || null,
    weekNumber: parseWeekNumber(formData.get("weekNumber")),
    description: normalizeText(formData.get("description")) || null,
    isPublic: parseBoolean(formData.get("isPublic")),
    sessions: parseSessions(formData.get("sessionsJson")),
  });
}

// ============================================================
// 공개 조회 액션 (인증 불필요)
// ============================================================

/**
 * 특정 연월의 공개 일정 + 세션 목록 조회
 * 메인 페이지 캘린더 섹션에서 사용
 */
export async function getScheduleEvents(year: number, month: number) {
  // 해당 월의 시작일(1일 00:00)과 마지막날(말일 23:59) 계산
  const startDate = new Date(year, month - 1, 1, 0, 0, 0);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  const events = await db.query.scheduleEvents.findMany({
    where: and(
      eq(scheduleEvents.isPublic, true),
      between(scheduleEvents.eventDate, startDate, endDate)
    ),
    with: {
      sessions: {
        orderBy: [asc(scheduleSessions.order)],
        with: {
          faculty: true,
        },
      },
      cohort: true,
    },
    orderBy: [asc(scheduleEvents.eventDate)],
  });

  return events;
}

/**
 * 클라이언트 컴포넌트용 월별 공개 일정 조회
 * Date 객체를 ISO 문자열로 직렬화해서 반환 (CalendarClient에서 router.push 없이 호출)
 */
export async function getSerializedScheduleEvents(year: number, month: number) {
  const events = await getScheduleEvents(year, month);
  return events.map((e) => ({
    id: e.id,
    eventDate: e.eventDate.toISOString(),
    eventType: e.eventType,
    title: e.title,
    weekNumber: e.weekNumber ?? null,
    description: e.description ?? null,
    cohort: e.cohort ? { id: e.cohort.id, name: e.cohort.name } : null,
    sessions: e.sessions.map((s) => ({
      category: s.category,
      content: s.content ?? null,
      reportCategory: s.reportCategory ?? null,
      subTitle: s.subTitle ?? null,
      subDescription: s.subDescription ?? null,
      faculty: s.faculty ? { id: s.faculty.id, name: s.faculty.name } : null,
      order: s.order,
    })),
  }));
}

// ============================================================
// 관리자 전용 액션 (requireAdmin 필수)
// ============================================================

/**
 * 전체 일정 목록 조회 (관리자 페이지 목록 화면용)
 */
export async function getAllScheduleEvents() {
  await requireAdmin();

  return db.query.scheduleEvents.findMany({
    with: {
      cohort: true,
      sessions: {
        orderBy: [asc(scheduleSessions.order)],
        with: { faculty: true },
      },
    },
    orderBy: [desc(scheduleEvents.eventDate)],
  });
}

/**
 * 단일 이벤트 상세 조회 (관리자 수정 폼용)
 */
export async function getScheduleEvent(id: string) {
  await requireAdmin();

  return db.query.scheduleEvents.findFirst({
    where: eq(scheduleEvents.id, id),
    with: {
      cohort: true,
      sessions: {
        orderBy: [asc(scheduleSessions.order)],
        with: { faculty: true },
      },
    },
  });
}

/**
 * 일정 생성
 * 이벤트 레코드 삽입 후 세션 슬롯들을 일괄 삽입
 */
export async function createScheduleEvent(
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  await requireAdmin();

  const result = parseFormData(formData);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, message: "입력값을 확인해주세요.", fieldErrors };
  }

  const { sessions, startTime, endTime, ...eventData } = result.data;

  // 이벤트 삽입
  const [newEvent] = await db
    .insert(scheduleEvents)
    .values({
      ...eventData,
      cohortId: eventData.cohortId ?? null,
      weekNumber: eventData.weekNumber ?? null,
      description: eventData.description ?? null,
      eventDate: new Date(`${eventData.eventDate}T${startTime}`),
      endTime: endTime ?? null,
    })
    .returning({ id: scheduleEvents.id });

  // CLASS 유형이고 세션이 있으면 세션 일괄 삽입
  if (eventData.eventType === "CLASS" && sessions.length > 0) {
    await db.insert(scheduleSessions).values(
      sessions.map((s, i) => ({
        scheduleEventId: newEvent.id,
        category: s.category,
        facultyId: s.facultyId ?? null,
        content: s.content ?? null,
        reportCategory: s.reportCategory ?? null,
        subTitle: s.subTitle ?? null,
        subDescription: s.subDescription ?? null,
        order: s.order ?? i,
      }))
    );
  }

  revalidatePath("/");
  revalidatePath("/admin/schedule");
  redirect("/admin/schedule");
}

/**
 * 일정 수정
 * 기존 세션을 전부 삭제하고 폼에서 받은 세션으로 교체 (단순 구현)
 */
export async function updateScheduleEvent(
  id: string,
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  await requireAdmin();

  const result = parseFormData(formData);

  if (!result.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const field = String(issue.path[0] ?? "");
      if (field && !fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { success: false, message: "입력값을 확인해주세요.", fieldErrors };
  }

  const { sessions, startTime, endTime, ...eventData } = result.data;

  // 이벤트 수정
  await db
    .update(scheduleEvents)
    .set({
      ...eventData,
      cohortId: eventData.cohortId ?? null,
      weekNumber: eventData.weekNumber ?? null,
      description: eventData.description ?? null,
      eventDate: new Date(`${eventData.eventDate}T${startTime}`),
      endTime: endTime ?? null,
    })
    .where(eq(scheduleEvents.id, id));

  // 기존 세션 전체 삭제 후 재삽입
  await db.delete(scheduleSessions).where(eq(scheduleSessions.scheduleEventId, id));

  if (eventData.eventType === "CLASS" && sessions.length > 0) {
    await db.insert(scheduleSessions).values(
      sessions.map((s, i) => ({
        scheduleEventId: id,
        category: s.category,
        facultyId: s.facultyId ?? null,
        content: s.content ?? null,
        reportCategory: s.reportCategory ?? null,
        subTitle: s.subTitle ?? null,
        subDescription: s.subDescription ?? null,
        order: s.order ?? i,
      }))
    );
  }

  revalidatePath("/");
  revalidatePath("/admin/schedule");
  redirect("/admin/schedule");
}

/**
 * 일정 삭제
 * CASCADE 설정으로 scheduleSessions도 자동 삭제됨
 */
export async function deleteScheduleEvent(id: string): Promise<ScheduleActionState> {
  await requireAdmin();

  await db.delete(scheduleEvents).where(eq(scheduleEvents.id, id));

  revalidatePath("/");
  revalidatePath("/admin/schedule");

  return { success: true, message: "일정이 삭제되었습니다." };
}
