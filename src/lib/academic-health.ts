/**
 * 지정 승인자만 보는 학사 운영 상태 집계입니다. 개인정보·파일 경로는 조회하지 않습니다.
 * 준비되지 않은 테이블을 0건으로 가장하지 않고, 수집되지 않는 실패 횟수는 null로 표시합니다.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { requireAcademicApprover } from "@/lib/academic-admin";
import { db } from "@/lib/db";
import type { AcademicObservation } from "@/lib/academic-observability";

export class AcademicHealthError extends Error {
  constructor(readonly status: 403 | 503) {
    super(status === 403 ? "학사 운영 책임자만 확인할 수 있습니다." : "학사 운영 상태 조회를 준비 중입니다.");
  }
}

// count(*)의 숫자/숫자 문자열만 받고 누락·빈 값·boolean을 0으로 바꾸지 않습니다.
const count = z.union([z.number(), z.string().regex(/^\d+$/).transform(Number)])
  .pipe(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER));
const metricSchema = z.object({
  unfinishedCount: count, expiredCount: count, verifiedUnsubmittedCount: count,
  cleanupClaimedCount: count, cleanupPendingCount: count, deletedCount: count,
});

/** 하나의 집계 문장 안에서 현재 DB 역할을 재검사해 세션 이후 역할 철회를 반영합니다. */
export function academicHealthMetricsSql(actorId: string) {
  return sql`SELECT
    (SELECT count(*) FROM public.assignment_upload_intents i WHERE i.state IN ('INTENDED','VERIFIED')) AS "unfinishedCount",
    (SELECT count(*) FROM public.assignment_upload_intents i WHERE i.state<>'CONSUMED' AND i.expires_at<=statement_timestamp()) AS "expiredCount",
    (SELECT count(*) FROM public.assignment_upload_intents i WHERE i.state='VERIFIED') AS "verifiedUnsubmittedCount",
    (SELECT count(*) FROM public.academic_upload_authorizations a WHERE a.cleanup_claimed_at IS NOT NULL AND a.deleted_at IS NULL) AS "cleanupClaimedCount",
    (SELECT count(*) FROM public.academic_upload_authorizations a JOIN public.assignment_upload_intents i ON i.id=a.intent_id
      WHERE i.state<>'CONSUMED' AND i.expires_at+interval '5 minutes'<=statement_timestamp()
        AND a.cleanup_claimed_at IS NULL AND a.deleted_at IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.assignment_submissions s WHERE s.upload_intent_id=i.id)
        AND NOT EXISTS (SELECT 1 FROM public.assignment_submission_files f WHERE f.storage_key=i.storage_key)) AS "cleanupPendingCount",
    (SELECT count(*) FROM public.academic_upload_authorizations a WHERE a.deleted_at IS NOT NULL) AS "deletedCount"
    WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id=${actorId}::uuid AND u.role IN ('ADMIN','FACULTY','MEMBER'))`;
}

export async function getAcademicHealth(observation: AcademicObservation) {
  let actorId: string;
  try {
    actorId = await requireAcademicApprover();
  } catch {
    throw new AcademicHealthError(403);
  }
  observation.authenticated(actorId);
  observation.emit("AUTHORIZED");
  if (process.env.ACADEMIC_ENABLED !== "true") throw new AcademicHealthError(503);
  const probe = await db.execute(sql`SELECT
    EXISTS(SELECT 1 FROM public.users u WHERE u.id=${actorId}::uuid AND u.role IN ('ADMIN','FACULTY','MEMBER')) AS authorized,
    to_regclass('public.assignment_upload_intents') IS NOT NULL
      AND to_regclass('public.assignment_submissions') IS NOT NULL
      AND to_regclass('public.assignment_submission_files') IS NOT NULL
      AND to_regclass('public.academic_upload_authorizations') IS NOT NULL AS ready`);
  const readiness = z.object({ authorized: z.boolean(), ready: z.boolean() }).parse(probe.rows[0]);
  if (!readiness.authorized) throw new AcademicHealthError(403);
  if (!readiness.ready) throw new AcademicHealthError(503);
  const result = await db.execute(academicHealthMetricsSql(actorId));
  if (!result.rows[0]) throw new AcademicHealthError(403);
  const metrics = metricSchema.parse(result.rows[0]);
  return { status: "PARTIAL" as const, metrics: { ...metrics, cleanupFailureCount: null, cleanupRetryCount: null },
    cleanupAttemptMetrics: "LOG_ONLY" as const, checkedAt: new Date().toISOString() };
}
