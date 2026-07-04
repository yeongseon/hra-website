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

import { and, asc, between, desc, eq, sql } from "drizzle-orm";
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

/**
 * "YYYY-MM-DD" + "HH:MM" → UTC Date 변환
 * Date.UTC() 사용으로 서버 타임존(dev=KST, prod=UTC) 차이를 없애고
 * 항상 동일한 UTC 값을 저장한다.
 * 관리자가 입력한 날짜/시간은 한국 달력 기준이므로 날짜 단위로만 UTC에 고정한다.
 */
function buildEventDate(dateStr: string, timeStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hours, minutes] = timeStr.split(":").map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
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
  // 일정은 buildEventDate 로 UTC 칸에 한국시간 숫자를 그대로 저장하므로,
  // 조회 범위도 Date.UTC 로 만들어 서버 타임존(dev=KST, prod=UTC)에 영향받지 않게 한다.
  const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

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

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return null;

  return db.query.scheduleEvents.findFirst({
    where: eq(scheduleEvents.id, parsedId.data),
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
 *
 * 원자화 원칙 (#62): CLASS + sessions 인 경우 event insert 와 sessions insert 를 단일
 * SQL CTE 로 묶어 Postgres statement-level atomicity 로 partial 반영을 원천 차단한다.
 * neon-http 드라이버는 db.transaction() 을 지원하지 않으므로 (src/lib/db/reorder.ts:5 참고)
 * CTE 가 유일한 원자화 수단이다.
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
  const eventDate = buildEventDate(eventData.eventDate, startTime);
  const hasSessions = eventData.eventType === "CLASS" && sessions.length > 0;

  if (!hasSessions) {
    // 세션이 없으면 단일 INSERT 로 충분 — 원자화 이슈 없음.
    await db.insert(scheduleEvents).values({
      ...eventData,
      cohortId: eventData.cohortId ?? null,
      weekNumber: eventData.weekNumber ?? null,
      description: eventData.description ?? null,
      eventDate,
      endTime: endTime ?? null,
    });
  } else {
    // CLASS + sessions — 단일 CTE 문장으로 원자 처리.
    // VALUES 절 첫 행 타입이 컬럼 타입을 결정하므로 NULL 가능 값은 명시적 캐스트가 필요하다.
    const sessionValues = sessions.map(
      (s, i) => sql`(
        ${s.category}::session_category,
        ${s.facultyId ?? null}::uuid,
        ${s.content ?? null}::text,
        ${s.reportCategory ?? null}::text,
        ${s.subTitle ?? null}::text,
        ${s.subDescription ?? null}::text,
        ${s.order ?? i}::integer
      )`
    );

    await db.execute(sql`
      WITH new_event AS (
        INSERT INTO schedule_events (
          event_date, end_time, event_type, title, cohort_id, week_number, description, is_public
        ) VALUES (
          ${eventDate},
          ${endTime ?? null},
          ${eventData.eventType}::schedule_event_type,
          ${eventData.title},
          ${eventData.cohortId ?? null}::uuid,
          ${eventData.weekNumber ?? null}::integer,
          ${eventData.description ?? null},
          ${eventData.isPublic}
        )
        RETURNING id
      )
      INSERT INTO schedule_sessions (
        schedule_event_id, category, faculty_id, content, report_category, sub_title, sub_description, "order"
      )
      SELECT ne.id, s.category, s.faculty_id, s.content, s.report_category, s.sub_title, s.sub_description, s."order"
      FROM new_event ne
      CROSS JOIN (VALUES ${sql.join(sessionValues, sql`, `)})
        AS s(category, faculty_id, content, report_category, sub_title, sub_description, "order")
    `);
  }

  revalidatePath("/");
  revalidatePath("/admin/schedule");
  redirect("/admin/schedule");
}

/**
 * 일정 수정
 *
 * UPDATE event + DELETE 기존 sessions + INSERT 새 sessions 를 단일 SQL CTE 로 묶어
 * partial 반영을 원천 차단한다. 세션 재삽입이 없어도 UPDATE 와 DELETE 는 함께
 * 원자화되어야 한다 (원자화 근거는 createScheduleEvent 의 docstring 참고).
 */
export async function updateScheduleEvent(
  id: string,
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  await requireAdmin();

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // 특히 이 함수는 raw SQL 의 ${id}::uuid 캐스트가 5곳에 있어 캐스트 실패 시
  // Vercel Logs 에 raw ID 가 노출될 위험이 크므로 반드시 사전 차단이 필요하다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { success: false, message: "유효하지 않은 ID입니다." };
  }

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
  const eventDate = buildEventDate(eventData.eventDate, startTime);
  const hasSessions = eventData.eventType === "CLASS" && sessions.length > 0;

  if (!hasSessions) {
    // 세션 없음 — UPDATE + DELETE 만 원자화.
    // 데이터 수정 CTE 는 참조되지 않아도 정확히 1회 실행된다 (Postgres 매뉴얼 규정).
    await db.execute(sql`
      WITH updated_event AS (
        UPDATE schedule_events SET
          event_date = ${eventDate},
          end_time = ${endTime ?? null},
          event_type = ${eventData.eventType}::schedule_event_type,
          title = ${eventData.title},
          cohort_id = ${eventData.cohortId ?? null}::uuid,
          week_number = ${eventData.weekNumber ?? null}::integer,
          description = ${eventData.description ?? null},
          is_public = ${eventData.isPublic}
        WHERE id = ${parsedId.data}::uuid
        RETURNING id
      )
      DELETE FROM schedule_sessions
      WHERE schedule_event_id = ${parsedId.data}::uuid
    `);
  } else {
    // CLASS + sessions — UPDATE + DELETE 기존 + INSERT 새 sessions 을 CTE 한 문장으로 처리.
    // DELETE 와 INSERT 모두 schedule_sessions 를 대상으로 하지만 새 sessions 는 PK
    // (defaultRandom UUID) 가 새로 발급되므로 PK 충돌은 발생하지 않는다.
    const sessionValues = sessions.map(
      (s, i) => sql`(
        ${s.category}::session_category,
        ${s.facultyId ?? null}::uuid,
        ${s.content ?? null}::text,
        ${s.reportCategory ?? null}::text,
        ${s.subTitle ?? null}::text,
        ${s.subDescription ?? null}::text,
        ${s.order ?? i}::integer
      )`
    );

    await db.execute(sql`
      WITH updated_event AS (
        UPDATE schedule_events SET
          event_date = ${eventDate},
          end_time = ${endTime ?? null},
          event_type = ${eventData.eventType}::schedule_event_type,
          title = ${eventData.title},
          cohort_id = ${eventData.cohortId ?? null}::uuid,
          week_number = ${eventData.weekNumber ?? null}::integer,
          description = ${eventData.description ?? null},
          is_public = ${eventData.isPublic}
        WHERE id = ${parsedId.data}::uuid
        RETURNING id
      ),
      deleted_sessions AS (
        DELETE FROM schedule_sessions
        WHERE schedule_event_id = ${parsedId.data}::uuid
        RETURNING id
      )
      INSERT INTO schedule_sessions (
        schedule_event_id, category, faculty_id, content, report_category, sub_title, sub_description, "order"
      )
      SELECT
        ${parsedId.data}::uuid,
        s.category, s.faculty_id, s.content, s.report_category, s.sub_title, s.sub_description, s."order"
      FROM (VALUES ${sql.join(sessionValues, sql`, `)})
        AS s(category, faculty_id, content, report_category, sub_title, sub_description, "order")
    `);
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

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { success: false, message: "유효하지 않은 ID입니다." };
  }

  await db.delete(scheduleEvents).where(eq(scheduleEvents.id, parsedId.data));

  revalidatePath("/");
  revalidatePath("/admin/schedule");

  return { success: true, message: "일정이 삭제되었습니다." };
}
