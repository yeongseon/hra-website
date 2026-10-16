/** 명부 조회 경계. 페이지뿐 아니라 직접 호출할 때도 지정 승인자를 먼저 확인한다. */
import { and, asc, count, countDistinct, desc, eq, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getAcademicApproverId, requireAcademicApprover } from "@/lib/academic-admin";
import { assertAcademicEnabled } from "./availability";
import { db } from "@/lib/db";
import { academicStudents, cohortEnrollments, cohorts } from "@/lib/db/schema";

export async function getRosterCohorts() {
  const actorId = await requireAcademicApprover();
  assertAcademicEnabled();
  return db.select({ id: cohorts.id, name: cohorts.name }).from(cohorts).where(approverCondition(actorId)).orderBy(asc(cohorts.order), asc(cohorts.name));
}

/** 개인정보를 반환하는 SQL 안에서 인증된 지정 계정의 현재 역할도 확인합니다. */
function approverCondition(actorId: string) {
  return sql<boolean>`EXISTS (SELECT 1 FROM public.users AS academic_roster_actor
    WHERE academic_roster_actor.id=${actorId}::uuid AND academic_roster_actor.id=${getAcademicApproverId()}::uuid
      AND academic_roster_actor.role IN ('ADMIN','FACULTY','MEMBER'))`;
}

export class AcademicRosterAccessError extends Error {
  readonly status = 403;
  constructor() { super("학사 운영 책임자만 확인할 수 있습니다."); }
}

export async function getAcademicRoster(cohortId?: string, page = 1) {
  const actorId = await requireAcademicApprover();
  assertAcademicEnabled();
  if (cohortId && !z.uuid().safeParse(cohortId).success) throw new Error("기수 식별자가 올바르지 않습니다.");
  const authorized = approverCondition(actorId);
  const filter = and(authorized, cohortId ? eq(cohortEnrollments.cohortId, cohortId) : undefined);
  const [summary, students] = await Promise.all([
    db.select({ authorized, total: countDistinct(academicStudents.id), unlinked: sql<number>`count(distinct case when ${academicStudents.userId} is null then ${academicStudents.id} end)::integer` })
      .from(academicStudents).leftJoin(cohortEnrollments, eq(cohortEnrollments.studentId, academicStudents.id)).where(filter),
    db.select({ id: academicStudents.id, displayName: academicStudents.displayName, linked: sql<boolean>`${academicStudents.userId} is not null`, enrollmentCount: count(cohortEnrollments.id) })
      .from(academicStudents).leftJoin(cohortEnrollments, eq(cohortEnrollments.studentId, academicStudents.id))
      .where(filter).groupBy(academicStudents.id).orderBy(asc(academicStudents.displayName), asc(academicStudents.id)).limit(100).offset((page - 1) * 100),
  ]);
  if (summary[0]?.authorized !== true) throw new AcademicRosterAccessError();
  return { total: summary[0]?.total ?? 0, unlinked: summary[0]?.unlinked ?? 0, students };
}

export async function getAcademicStudent(id: string) {
  const actorId = await requireAcademicApprover();
  assertAcademicEnabled();
  if (!z.uuid().safeParse(id).success) return null;
  const [student] = await db.select({ id: academicStudents.id, displayName: academicStudents.displayName, linked: sql<boolean>`${academicStudents.userId} is not null` })
    .from(academicStudents).where(and(eq(academicStudents.id, id), approverCondition(actorId))).limit(1);
  if (!student) return null;
  const enrollments = await db.select({ id: cohortEnrollments.id, cohortName: cohorts.name, status: cohortEnrollments.status, enrolledAt: cohortEnrollments.enrolledAt })
    .from(cohortEnrollments).innerJoin(cohorts, eq(cohortEnrollments.cohortId, cohorts.id))
    .where(and(eq(cohortEnrollments.studentId, id), approverCondition(actorId))).orderBy(desc(cohortEnrollments.enrolledAt));
  return { ...student, enrollments };
}
