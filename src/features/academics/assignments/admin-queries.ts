/** 승인자 전용 과제 화면의 최소 조회 경계다. 준비되지 않은 DB의 수치를 0으로 대체하지 않는다. */
import "server-only";
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod/v4";
import { getAcademicApproverId, requireAcademicApprover } from "@/lib/academic-admin";
import { db } from "@/lib/db";
import { assignmentResultSchema, listAssignmentsSchema } from "./validation";
import { listAssignmentsAdmin } from "./service";
import { sessionCategoryLabels } from "./admin-display";

export class AssignmentPreparationError extends Error {
  constructor() { super("과제 관리 기능을 준비하고 있습니다."); }
}

export class AssignmentReadPermissionError extends Error {
  readonly status = 403;
  constructor() { super("학사 운영 책임자만 과제를 조회할 수 있습니다."); }
}

/** 인증 후 권한이 철회되는 경합도 막도록 실제 데이터 조회와 같은 SQL 문장에서 현재 역할을 확인한다. */
async function executeAuthorizedRead(actorId: string, statement: SQL): Promise<unknown[]> {
  const result = await db.execute(sql`WITH access AS MATERIALIZED (
    SELECT EXISTS (SELECT 1 FROM public.users u
      WHERE u.id=${actorId}::uuid AND u.id=${getAcademicApproverId()}::uuid
        AND u.role IN ('ADMIN','FACULTY','MEMBER')) AS permitted
  ) SELECT permitted, CASE WHEN permitted THEN (
    SELECT coalesce(jsonb_agg(to_jsonb(record)),'[]'::jsonb) FROM (${statement}) record
  ) ELSE '[]'::jsonb END AS records FROM access`);
  const envelope = z.object({ permitted: z.boolean(), records: z.array(z.unknown()) }).parse(result.rows[0]);
  if (!envelope.permitted) throw new AssignmentReadPermissionError();
  return envelope.records;
}

async function queryReadiness(actorId: string) {
  const rows = await executeAuthorizedRead(actorId, sql`SELECT
    to_regclass('public.assignments') IS NOT NULL AND to_regclass('public.assignment_targets') IS NOT NULL
    AND to_regclass('public.assignment_submissions') IS NOT NULL
    AND to_regprocedure('public.mutate_academic_assignment(text,uuid,uuid,uuid,uuid,jsonb)') IS NOT NULL AS ready`);
  return z.object({ ready: z.boolean() }).parse(rows[0]).ready;
}

/** 각 페이지에서도 독립적으로 검사하여 레이아웃과 자식의 병렬 실행 중 조회를 막는다. */
export async function getAssignmentAdminAvailability(): Promise<boolean> {
  const actorId = await requireAcademicApprover();
  if (process.env.ACADEMIC_ENABLED !== "true") return false;
  return queryReadiness(actorId);
}

async function requireAssignmentAdminReady() {
  const actorId = await requireAcademicApprover();
  if (process.env.ACADEMIC_ENABLED !== "true" || !await queryReadiness(actorId)) throw new AssignmentPreparationError();
  return actorId;
}

const metadataSchema = z.object({
  id: z.uuid(), cohortName: z.string(), eventTitle: z.string().nullable(),
  sessionLabel: z.string().nullable(), submissionCount: z.number().int().nonnegative(),
});
const detailSchema = metadataSchema.extend({ result: assignmentResultSchema });
export type AssignmentAdminRecord = z.infer<typeof detailSchema>;

/** 과제별 실제 제출 테이블만 집계하며 파일·이메일·계정 자격정보는 조회하지 않는다. */
async function queryAssignmentDetails(actorId: string, ids: string[]) {
  const rows = await executeAuthorizedRead(actorId, sql`SELECT a.id, c.name AS "cohortName", ev.title AS "eventTitle",
    coalesce(se.content, se.sub_title) AS "sessionLabel",
    (SELECT count(*)::integer FROM public.assignment_submissions sub
      JOIN public.assignment_targets st ON st.id=sub.assignment_target_id WHERE st.assignment_id=a.id) AS "submissionCount",
    jsonb_build_object('assignment',to_jsonb(a),'targetCount',
      (SELECT count(*) FROM public.assignment_targets t WHERE t.assignment_id=a.id)) AS result
    FROM public.assignments a JOIN public.cohorts c ON c.id=a.cohort_id
    LEFT JOIN public.schedule_events ev ON ev.id=a.schedule_event_id
    LEFT JOIN public.schedule_sessions se ON se.id=a.schedule_session_id
    WHERE a.id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)::uuid)`);
  return rows.map(row => detailSchema.parse(row));
}

export async function getAssignmentAdminList(input: unknown = {}) {
  const actorId = await requireAssignmentAdminReady();
  const filter = listAssignmentsSchema.parse(input);
  const records = await listAssignmentsAdmin(filter);
  const details = await queryAssignmentDetails(actorId, records.map(record => record.assignment.id));
  const byId = new Map(details.map(record => [record.id, record]));
  return records.map(record => {
    const detail = byId.get(record.assignment.id);
    if (!detail) throw new Error("과제 조회 결과가 변경되었습니다. 다시 조회해 주세요.");
    return detail;
  });
}

export async function getAssignmentAdmin(id: string) {
  const actorId = await requireAssignmentAdminReady();
  if (!z.uuid().safeParse(id).success) return null;
  return (await queryAssignmentDetails(actorId, [id]))[0] ?? null;
}

const cohortOptionsSchema = z.object({ id: z.uuid(), name: z.string() });
const eventOptionSchema = z.object({ id: z.uuid(), cohortId: z.uuid(), title: z.string() });
const sessionOptionSchema = z.object({ id: z.uuid(), eventId: z.uuid(), category: z.string(), content: z.string().nullable(), subTitle: z.string().nullable() });
const cohortOptionsSql = sql`SELECT id,name FROM public.cohorts ORDER BY "order",name`;

export async function getAssignmentCohorts() {
  const actorId = await requireAssignmentAdminReady();
  return z.array(cohortOptionsSchema).parse(await executeAuthorizedRead(actorId, cohortOptionsSql));
}

export async function getAssignmentFormOptions() {
  const actorId = await requireAssignmentAdminReady();
  const [cohortRows, eventRows, sessionRows] = await Promise.all([
    executeAuthorizedRead(actorId, cohortOptionsSql),
    executeAuthorizedRead(actorId, sql`SELECT id,cohort_id AS "cohortId",title FROM public.schedule_events
      WHERE event_type='CLASS' AND cohort_id IS NOT NULL ORDER BY event_date DESC`),
    executeAuthorizedRead(actorId, sql`SELECT id,schedule_event_id AS "eventId",category,content,sub_title AS "subTitle"
      FROM public.schedule_sessions ORDER BY "order",id`),
  ]);
  return { cohorts: z.array(cohortOptionsSchema).parse(cohortRows), events: z.array(eventOptionSchema).parse(eventRows),
    sessions: z.array(sessionOptionSchema).parse(sessionRows).map(session => ({
      id: session.id, eventId: session.eventId,
      label: `${sessionCategoryLabels[session.category] ?? "수업"}${session.content || session.subTitle ? ` · ${session.content || session.subTitle}` : ""}`,
    })) };
}
export type AssignmentFormOptions = Awaited<ReturnType<typeof getAssignmentFormOptions>>;

const previewSchema = z.object({
  assignmentId: z.uuid(), expectedUpdatedAt: z.iso.datetime({ offset: true }), expectedTargetFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  reviewedAt: z.iso.datetime({ offset: true }), targetCount: z.number().int().nonnegative(), unlinkedCount: z.number().int().nonnegative(),
});
export type AssignmentPublishPreview = z.infer<typeof previewSchema>;

/** 공개 SQL과 같은 유효 학적 조건 및 UUID 순서를 사용하여 서버의 단일 기준 시각으로 대상을 확인한다. */
export async function getAssignmentPublishPreview(id: string) {
  const actorId = await requireAssignmentAdminReady();
  if (!z.uuid().safeParse(id).success) return null;
  const rows = await executeAuthorizedRead(actorId, sql`WITH reviewed AS MATERIALIZED (SELECT clock_timestamp() AS at),
    definition AS (SELECT a.* FROM public.assignments a WHERE a.id=${id}::uuid AND a.status='DRAFT'),
    candidates AS (SELECT e.id, s.user_id FROM public.cohort_enrollments e
      JOIN public.academic_students s ON s.id=e.student_id JOIN definition a ON a.cohort_id=e.cohort_id CROSS JOIN reviewed r
      WHERE e.status='ENROLLED' AND e.ended_at IS NULL AND e.enrolled_at<=r.at AND e.created_at<=r.at)
    SELECT jsonb_build_object('assignmentId',a.id,'expectedUpdatedAt',a.updated_at,'reviewedAt',r.at,
      'expectedTargetFingerprint',encode(sha256(convert_to(coalesce((SELECT string_agg(c.id::text,',' ORDER BY c.id) FROM candidates c),''),'UTF8')),'hex'),
      'targetCount',(SELECT count(*) FROM candidates),'unlinkedCount',(SELECT count(*) FROM candidates WHERE user_id IS NULL)) AS result
    FROM definition a CROSS JOIN reviewed r`);
  return rows[0] ? z.object({ result: previewSchema }).parse(rows[0]).result : null;
}
