/**
 * 지정 운영 책임자의 회원-학적 수동 연결 서비스입니다.
 * 호출자가 actor ID를 전달할 수 없으며 SQL 함수가 연결·등록·감사를 원자 확정합니다.
 */
import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { assertAcademicWritesEnabled, getAcademicApproverId, requireAcademicApprover } from "@/lib/academic-admin";
import { db } from "@/lib/db";
import type { AcademicObservation } from "@/lib/academic-observability";
import { enrollmentPlanSchema } from "./plan.mjs";

export type EnrollmentLinkPlan = z.infer<typeof enrollmentPlanSchema>;

const applyResultSchema = z.object({
  requestId: z.uuid(),
  linkedCount: z.number().int().nonnegative(),
  enrolledCount: z.number().int().nonnegative(),
  replayed: z.boolean(),
});

/** 식별자만 포함한 후보 보고입니다. 조회 후보를 자동 등록하지 않습니다. */
export async function inspectEnrollmentCandidates() {
  await requireAcademicApprover();
  const result = await db.execute(sql`SELECT public.inspect_academic_enrollment_candidates() AS report`);
  return result.rows[0]?.report;
}

/** 승인 계획에 명시된 학생·계정·등록 기수만 처리합니다. */
export async function applyEnrollmentLinkPlan(input: unknown, observation?: AcademicObservation) {
  const actorId = await requireAcademicApprover();
  observation?.authenticated(actorId);
  observation?.emit("AUTHORIZED");
  assertAcademicWritesEnabled();
  const parsed = enrollmentPlanSchema.safeParse(input);
  if (!parsed.success) throw new Error("승인 계획의 형식이 올바르지 않습니다.");
  const plan = parsed.data;
  observation?.identify({ requestId: plan.requestId, resourceId: plan.requestId });
  if (plan.approverUserId !== actorId) throw new Error("승인 계획의 책임자가 일치하지 않습니다.");
  const result = await db.execute(sql`
    SELECT public.apply_academic_enrollment_links(
      ${actorId}::uuid, ${getAcademicApproverId()}::uuid, ${JSON.stringify(plan)}::jsonb
    ) AS result
  `);
  return applyResultSchema.parse(result.rows[0]?.result);
}
