/**
 * 학생 본인 과제 조회에 사용하는 Neon HTTP/Drizzle 쿼리 작성기다.
 * 페이지·서버 액션은 queries.ts와 academic-permissions.ts를 호출하며 이 내부 작성기에 사용자 ID를 직접 전달하지 않는다.
 * 작성된 실제 SQL은 격리 PostgreSQL 권한 매트릭스 테스트에서도 그대로 실행한다.
 */
import "server-only";
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { academicStudents, cohortEnrollments, users } from "@/lib/db/schema";
import { assignments, assignmentTargets } from "@/lib/db/academic-assignments";
import { assignmentSubmissionFiles, assignmentSubmissions } from "@/lib/db/academic-submissions";
import type { AssignmentTargetSelector } from "./contracts";

// 연결 방식은 기존 Neon HTTP를 유지하며 선택 쿼리만 요구한다.
type StudentQueryDatabase = Pick<typeof db, "select">;

// 클라이언트의 기수·학생·학적 정보 대신 현재 세션 계정과 현재 유효 학적을 DB에서 연결한다.
function visibleTargetCondition(userId: string) {
  return and(
    eq(academicStudents.userId, userId),
    // 인증 직후 역할이 철회되어도 실제 조회 문장의 현재 스냅샷에서 자료를 차단한다.
    sql`EXISTS (SELECT 1 FROM ${users} WHERE ${users.id} = ${userId} AND ${users.role} = 'MEMBER')`,
    eq(cohortEnrollments.status, "ENROLLED"),
    isNull(cohortEnrollments.endedAt),
    lte(cohortEnrollments.enrolledAt, sql`CURRENT_TIMESTAMP`),
    lte(cohortEnrollments.createdAt, sql`CURRENT_TIMESTAMP`),
    eq(cohortEnrollments.cohortId, assignments.cohortId),
    inArray(assignments.status, ["PUBLISHED", "CLOSED"]),
    isNotNull(assignments.publishedAt),
    isNotNull(assignments.dueAt),
    lte(assignments.publishedAt, sql`CURRENT_TIMESTAMP`),
  );
}

// 타인의 대상 UUID와 본인 과제 UUID를 같은 조회 조건으로 판단한다.
export function buildAssignmentTargetLookup(database: StudentQueryDatabase, userId: string, selector: AssignmentTargetSelector) {
  const selected = "assignmentId" in selector ? eq(assignments.id, selector.assignmentId) : eq(assignmentTargets.id, selector.targetId);
  return database.select({
    assignmentId: assignments.id, targetId: assignmentTargets.id, status: assignments.status,
    dueAt: assignments.dueAt, publishedAt: assignments.publishedAt,
  }).from(assignmentTargets)
    .innerJoin(assignments, eq(assignments.id, assignmentTargets.assignmentId))
    .innerJoin(cohortEnrollments, eq(cohortEnrollments.id, assignmentTargets.enrollmentId))
    .innerJoin(academicStudents, eq(academicStudents.id, cohortEnrollments.studentId))
    .where(and(visibleTargetCondition(userId), selected)).limit(1);
}

// 제출 LEFT JOIN에도 현재 계정을 명시하여 본인 대상의 본인 최종 제출만 선택한다.
export function buildStudentAssignmentListQuery(database: StudentQueryDatabase, userId: string, page: number, pageSize: number) {
  return database.select({
    assignmentId: assignments.id, targetId: assignmentTargets.id, title: assignments.title,
    status: assignments.status, dueAt: assignments.dueAt, publishedAt: assignments.publishedAt,
    submittedAt: assignmentSubmissions.submittedAt,
  }).from(assignmentTargets)
    .innerJoin(assignments, eq(assignments.id, assignmentTargets.assignmentId))
    .innerJoin(cohortEnrollments, eq(cohortEnrollments.id, assignmentTargets.enrollmentId))
    .innerJoin(academicStudents, eq(academicStudents.id, cohortEnrollments.studentId))
    .leftJoin(assignmentSubmissions, and(eq(assignmentSubmissions.assignmentTargetId, assignmentTargets.id), eq(assignmentSubmissions.submittedByUserId, userId)))
    .where(visibleTargetCondition(userId)).orderBy(asc(assignments.dueAt), asc(assignments.id))
    .limit(pageSize + 1).offset((page - 1) * pageSize);
}

// 공통 권한 검사가 끝난 뒤에도 소유권 조건을 반복하여 두 조회 사이의 학적 변경을 반영한다.
export function buildStudentAssignmentDetailQuery(database: StudentQueryDatabase, userId: string, targetId: string) {
  return database.select({
    assignmentId: assignments.id, targetId: assignmentTargets.id, title: assignments.title,
    status: assignments.status, dueAt: assignments.dueAt, publishedAt: assignments.publishedAt,
    instructions: assignments.instructions, submittedAt: assignmentSubmissions.submittedAt,
    fileId: assignmentSubmissionFiles.id, originalName: assignmentSubmissionFiles.originalName,
    mimeType: assignmentSubmissionFiles.mimeType, sizeBytes: assignmentSubmissionFiles.sizeBytes,
  }).from(assignmentTargets)
    .innerJoin(assignments, eq(assignments.id, assignmentTargets.assignmentId))
    .innerJoin(cohortEnrollments, eq(cohortEnrollments.id, assignmentTargets.enrollmentId))
    .innerJoin(academicStudents, eq(academicStudents.id, cohortEnrollments.studentId))
    .leftJoin(assignmentSubmissions, and(eq(assignmentSubmissions.assignmentTargetId, assignmentTargets.id), eq(assignmentSubmissions.submittedByUserId, userId)))
    .leftJoin(assignmentSubmissionFiles, eq(assignmentSubmissionFiles.submissionId, assignmentSubmissions.id))
    .where(and(visibleTargetCondition(userId), eq(assignmentTargets.id, targetId))).limit(1);
}
