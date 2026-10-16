/**
 * 공개 당시 과제 대상 전원을 기준으로 최종 제출을 LEFT JOIN한다.
 * 한 SQL의 동일 snapshot에서 전체 분모·필터 수·페이지 행을 함께 계산한다.
 */
import "server-only";
import { sql } from "drizzle-orm";
import type { ParsedSubmissionStatusInput } from "./contracts";

export const SUBMISSION_STATUS_EXPORT_LIMIT = 10000;

export function buildSubmissionStatusesQuery(input: ParsedSubmissionStatusInput, authorization: { actorId: string; configuredId: string }, exportAll = false) {
  const orderColumn = input.sort === "submittedAt" ? sql`"submittedAt"` : sql`"displayName"`;
  const direction = input.direction === "desc" ? sql`DESC` : sql`ASC`;
  const cohort = input.cohortId ? sql`AND a.cohort_id=${input.cohortId}::uuid` : sql``;
  const status = input.status === "SUBMITTED" ? sql`AND "submittedAt" IS NOT NULL`
    : input.status === "UNSUBMITTED" ? sql`AND "submittedAt" IS NULL` : sql``;
  const limit = exportAll ? SUBMISSION_STATUS_EXPORT_LIMIT + 1 : input.pageSize;
  const offset = exportAll ? 0 : (input.page - 1) * input.pageSize;
  return sql`
    WITH actor_gate AS MATERIALIZED (
      SELECT EXISTS (SELECT 1 FROM users u WHERE u.id=${authorization.actorId}::uuid
        AND u.id=${authorization.configuredId}::uuid AND u.role::text IN ('ADMIN','FACULTY','MEMBER')) AS allowed
    ), definition AS (
      SELECT a.id,a.title,a.cohort_id,a.status FROM assignments a
      WHERE (SELECT allowed FROM actor_gate) AND a.id=${input.assignmentId}::uuid ${cohort} AND a.status IN ('PUBLISHED','CLOSED') AND a.published_at<=CURRENT_TIMESTAMP
    ), targets AS (
      SELECT t.id AS "targetId",s.display_name AS "displayName",s.user_id IS NOT NULL AS "accountLinked",
        (e.status='ENROLLED' AND e.ended_at IS NULL AND e.enrolled_at<=CURRENT_TIMESTAMP AND e.created_at<=CURRENT_TIMESTAMP) AS "enrollmentActive",
        sub.submitted_at AS "submittedAt"
      FROM definition a JOIN assignment_targets t ON t.assignment_id=a.id
      JOIN cohort_enrollments e ON e.id=t.enrollment_id JOIN academic_students s ON s.id=e.student_id
      LEFT JOIN assignment_submissions sub ON sub.assignment_target_id=t.id
    ), filtered AS (
      SELECT * FROM targets WHERE strpos(lower("displayName"),lower(${input.search}))>0 ${status}
    ), ordered AS (
      SELECT *,row_number() OVER (ORDER BY ${orderColumn} ${direction} NULLS LAST,"targetId" ASC) AS "rowOrder" FROM filtered
    ), paged AS (SELECT * FROM ordered ORDER BY "rowOrder" LIMIT ${limit} OFFSET ${offset})
    SELECT
      (SELECT allowed FROM actor_gate) AS authorized,
      (SELECT jsonb_build_object('id',id,'title',title,'cohortId',cohort_id,'status',status) FROM definition) AS assignment,
      (SELECT jsonb_build_object('total',count(*)::integer,'submitted',count("submittedAt")::integer,'unsubmitted',(count(*)-count("submittedAt"))::integer) FROM targets) AS counts,
      (SELECT count(*)::integer FROM filtered) AS "filteredCount",
      COALESCE((SELECT jsonb_agg(to_jsonb(p)-'rowOrder' ORDER BY p."rowOrder") FROM paged p),'[]'::jsonb) AS rows`;
}
