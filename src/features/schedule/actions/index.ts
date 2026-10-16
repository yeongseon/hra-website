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
import { isConstraintViolation } from "@/lib/db/constraint-errors";
import { logServerError } from "@/lib/errors";
import { scheduleEvents, scheduleSessions } from "@/lib/db/schema";
import { parseCalendarMonth } from "@/lib/query-params";

// ============================================================
// Zod 스키마 정의
// ============================================================

// 세션 슬롯 하나에 대한 유효성 검사
const sessionSchema = z.object({
  // 폼의 로컬 키와 구분해 기존 세션의 영속 UUID만 받는다.
  serverId: z.string().uuid().transform(value => value.toLowerCase()).optional(),
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
  // Date.UTC는 00~99년을 1900년대로 해석하므로 운영 가능한 연도도 제한한다.
  eventDate: z.iso.date("올바른 날짜를 입력해주세요.")
    .refine((value) => Number(value.slice(0, 4)) >= 1900 && Number(value.slice(0, 4)) <= 2100,
      "올바른 날짜를 입력해주세요."),
  startTime: z.iso.time({ precision: -1, error: "올바른 시작 시간을 입력해주세요." }), // "HH:MM"
  endTime: z.iso.time({ precision: -1, error: "올바른 종료 시간을 입력해주세요." }).optional().nullable(),
  eventType: z.enum(["CLASS", "EVENT"]),
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(200, "제목은 200자 이하여야 합니다."),
  cohortId: z.string().uuid().optional().nullable(),
  weekNumber: z.number().int().positive().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  isPublic: z.boolean().default(true),
  sessions: z.array(sessionSchema).default([]).superRefine((sessions, context) => {
    const ids = new Set<string>();
    for (const [index, session] of sessions.entries()) {
      if (!session.serverId) continue;
      if (ids.has(session.serverId)) context.addIssue({ code: "custom", path: [index, "serverId"], message: "같은 세션을 중복해서 저장할 수 없습니다." });
      ids.add(session.serverId);
    }
  }),
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

// 잘못된 JSON을 빈 배열로 해석하면 기존 세션이 삭제될 수 있어 검증 오류로 돌린다.
function parseSessions(value: FormDataEntryValue | null): unknown {
  if (typeof value !== "string" || value.trim() === "") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed;
  } catch {
    return null;
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
  // 서버 액션은 클라이언트에서 직접 호출할 수 있으므로 조회 인자도 범위 검증한다.
  const valid = parseCalendarMonth(year, month);
  // 해당 월의 시작일(1일 00:00)과 마지막날(말일 23:59) 계산
  // 일정은 buildEventDate 로 UTC 칸에 한국시간 숫자를 그대로 저장하므로,
  // 조회 범위도 Date.UTC 로 만들어 서버 타임존(dev=KST, prod=UTC)에 영향받지 않게 한다.
  const startDate = new Date(Date.UTC(valid.year, valid.month - 1, 1, 0, 0, 0));
  const endDate = new Date(Date.UTC(valid.year, valid.month, 0, 23, 59, 59));

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

  // 새 일정은 기존 세션의 UUID를 채택하지 않는다.
  if (result.data.sessions.some(session => session.serverId)) {
    return { success: false, message: "새 일정에는 기존 세션을 연결할 수 없습니다." };
  }

  const { sessions, startTime, endTime, ...eventData } = result.data;
  const eventDate = buildEventDate(eventData.eventDate, startTime);
  // timestamp(시간대 없음) 컬럼에는 KST 달력의 벽시계 값을 ISO 문자열로 통일해 전달한다.
  const eventDateSql = eventDate.toISOString();
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
          ${eventDateSql}::timestamp,
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
 * 일정 수정은 기존 세션 UUID를 보존하며 변경된 행만 원자적으로 저장한다.
 * Neon HTTP는 대화형 트랜잭션을 지원하지 않으므로 소유권 검사·행 잠금·일정 수정·
 * 세션 UPDATE/INSERT/DELETE를 단일 SQL CTE로 묶는다. 과제가 참조하는 세션을
 * 유지하면 일반 제목/내용 수정이 가능하고, 실제 제거하면 RESTRICT FK가 전체를 롤백한다.
 */
export async function updateScheduleEvent(
  id: string,
  _prevState: ScheduleActionState,
  formData: FormData
): Promise<ScheduleActionState> {
  await requireAdmin();
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return { success: false, message: "유효하지 않은 ID입니다." };

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
  const eventDateSql = buildEventDate(eventData.eventDate, startTime).toISOString();
  // 행사용 전환 시 기존 동작대로 세션을 제거하되, 전달된 UUID의 소유권부터 검증한다.
  const sessionPayload = sessions.map(session => ({
    id: session.serverId ?? null,
    category: session.category,
    faculty_id: session.facultyId ?? null,
    content: session.content ?? null,
    report_category: session.reportCategory ?? null,
    sub_title: session.subTitle ?? null,
    sub_description: session.subDescription ?? null,
    order: session.order,
  }));

  try {
    const saved = await db.execute(sql`
      WITH input_sessions AS MATERIALIZED (
        SELECT * FROM jsonb_to_recordset(${JSON.stringify(sessionPayload)}::jsonb)
          AS s(id uuid, category session_category, faculty_id uuid, content text,
            report_category text, sub_title text, sub_description text, "order" integer)
      ), locked_event AS MATERIALIZED (
        SELECT id FROM schedule_events WHERE id = ${parsedId.data}::uuid FOR UPDATE
      ), locked_sessions AS MATERIALIZED (
        SELECT s.id FROM schedule_sessions s JOIN locked_event e ON e.id = s.schedule_event_id FOR UPDATE OF s
      ), valid_request AS MATERIALIZED (
        SELECT NOT EXISTS (
          SELECT 1 FROM input_sessions s WHERE s.id IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM locked_sessions owned WHERE owned.id = s.id)
        ) AS valid
      ), requested_sessions AS MATERIALIZED (
        SELECT * FROM input_sessions WHERE ${eventData.eventType === "CLASS"}::boolean
      ), updated_event AS (
        UPDATE schedule_events SET
          event_date = ${eventDateSql}::timestamp,
          end_time = ${endTime ?? null},
          event_type = ${eventData.eventType}::schedule_event_type,
          title = ${eventData.title},
          cohort_id = ${eventData.cohortId ?? null}::uuid,
          week_number = ${eventData.weekNumber ?? null}::integer,
          description = ${eventData.description ?? null},
          is_public = ${eventData.isPublic},
          updated_at = now()
        WHERE id IN (SELECT id FROM locked_event) AND (SELECT valid FROM valid_request)
        RETURNING id
      ), updated_sessions AS (
        UPDATE schedule_sessions existing SET category = incoming.category,
          faculty_id = incoming.faculty_id, content = incoming.content,
          report_category = incoming.report_category, sub_title = incoming.sub_title,
          sub_description = incoming.sub_description, "order" = incoming."order"
        FROM requested_sessions incoming, updated_event e
        WHERE existing.id = incoming.id AND existing.schedule_event_id = e.id
        RETURNING existing.id
      ), deleted_sessions AS (
        DELETE FROM schedule_sessions existing USING updated_event e
        WHERE existing.schedule_event_id = e.id
          AND NOT EXISTS (SELECT 1 FROM requested_sessions incoming WHERE incoming.id = existing.id)
        RETURNING existing.id
      ), inserted_sessions AS (
        INSERT INTO schedule_sessions (schedule_event_id, category, faculty_id, content,
          report_category, sub_title, sub_description, "order")
        SELECT e.id, incoming.category, incoming.faculty_id, incoming.content,
          incoming.report_category, incoming.sub_title, incoming.sub_description, incoming."order"
        FROM requested_sessions incoming CROSS JOIN updated_event e WHERE incoming.id IS NULL
        RETURNING id
      )
      SELECT EXISTS (SELECT 1 FROM locked_event) AS event_exists,
        (SELECT valid FROM valid_request) AS sessions_valid,
        (SELECT count(*) FROM updated_sessions) AS updated_count,
        (SELECT count(*) FROM deleted_sessions) AS deleted_count,
        (SELECT count(*) FROM inserted_sessions) AS inserted_count
    `);
    const status = z.object({ event_exists: z.boolean(), sessions_valid: z.boolean() }).safeParse(saved.rows[0]);
    if (!status.success) throw new Error("일정 저장 결과를 확인할 수 없습니다.");
    if (!status.data.event_exists) return { success: false, message: "일정을 찾을 수 없습니다. 목록을 새로고침해주세요." };
    if (!status.data.sessions_valid) return { success: false, message: "다른 일정의 세션이 포함되었거나 세션이 변경되었습니다. 새로고침 후 다시 확인해주세요." };
  } catch (error) {
    // PostgreSQL 18의 RESTRICT 위반은 23001이며, 이전 서버의 23503도 같은 정책으로 처리한다.
    if (["23001", "23503"].some(code => isConstraintViolation(error, code, "assignments_schedule_session_id_schedule_sessions_id_fk"))) {
      return { success: false, message: "과제에 연결된 세션은 삭제할 수 없습니다. 해당 세션을 유지한 뒤 다시 저장해주세요." };
    }
    // SQL 본문과 입력값은 반환하지 않으며, 서버 로그 역시 기존 정제 헬퍼를 사용한다.
    logServerError("schedule/update", error, { eventId: parsedId.data, sessionCount: sessions.length });
    return { success: false, message: "일정을 저장하지 못했습니다. 연결된 기록과 입력값을 확인한 뒤 다시 시도해주세요." };
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
