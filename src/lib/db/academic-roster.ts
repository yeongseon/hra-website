/** 학생·기수 등록은 SQL 함수 한 번으로 실행하여 명부와 승인 이력을 함께 확정한다. */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { isConstraintViolation } from "@/lib/db/constraint-errors";
import { check, foreignKey, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { academicStudents, cohortEnrollments, cohorts, users } from "@/lib/db/schema";
import type { RosterInput } from "@/features/academics/roster/input";

// 실제 표시 이름은 학생 표에만 저장하고 감사에는 참조 식별자와 해시만 남긴다.
export const academicRosterRegistrations = pgTable("academic_roster_registrations", {
  requestId: uuid("request_id").primaryKey(),
  actorUserId: uuid("actor_user_id").notNull(),
  studentId: uuid("student_id").notNull(),
  cohortId: uuid("cohort_id").notNull(),
  enrollmentId: uuid("enrollment_id").notNull().unique(),
  verificationMethod: text("verification_method").notNull(),
  evidenceReference: uuid("evidence_reference").notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => ({
  actorForeignKey: foreignKey({ name: "academic_roster_registrations_actor_fk", columns: [table.actorUserId], foreignColumns: [users.id] }).onDelete("restrict"),
  studentForeignKey: foreignKey({ name: "academic_roster_registrations_student_fk", columns: [table.studentId], foreignColumns: [academicStudents.id] }).onDelete("restrict"),
  cohortForeignKey: foreignKey({ name: "academic_roster_registrations_cohort_fk", columns: [table.cohortId], foreignColumns: [cohorts.id] }).onDelete("restrict"),
  enrollmentForeignKey: foreignKey({ name: "academic_roster_registrations_enrollment_fk", columns: [table.enrollmentId], foreignColumns: [cohortEnrollments.id] }).onDelete("restrict"),
  verificationMethodCheck: check("academic_roster_registrations_verification_method_check", sql`${table.verificationMethod} IN ('IN_PERSON', 'VERIFIED_CONTACT')`),
  fingerprintCheck: check("academic_roster_registrations_request_fingerprint_check", sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
}));

export async function registerAcademicStudent(input: RosterInput, actorId: string) {
  const result = await db.execute<{ student_id: string; enrollment_id: string }>(sql`
    SELECT * FROM register_academic_roster(
      ${input.requestId}::uuid, ${actorId}::uuid, ${input.cohortId}::uuid,
      ${input.studentId || null}::uuid, ${input.displayName || null}::text,
      ${input.verificationMethod}::text, ${input.evidenceReference}::uuid
    )
  `);
  const row = result.rows[0];
  if (!row) throw new Error("학생 등록 결과를 확인할 수 없습니다.");
  return { studentId: row.student_id, enrollmentId: row.enrollment_id };
}

/** DB 내부 오류나 개인정보를 브라우저에 보내지 않고 알려진 등록 실패만 설명한다. */
export function rosterErrorMessage(error: unknown): string {
  if (isConstraintViolation(error, "23505", "cohort_enrollments_student_cohort_unique")) {
    return "이미 해당 기수에 등록된 학생입니다.";
  }
  const messages = new Map<string, string>([
    ["roster_missing_cohort", "선택한 기수를 찾을 수 없습니다."],
    ["roster_missing_student", "기존 학생을 찾을 수 없습니다. 학생 식별자를 확인해 주세요."],
    ["roster_request_conflict", "같은 요청 식별자로 다른 등록을 요청할 수 없습니다. 등록 화면을 다시 열어 주세요."],
  ]);
  // SQL 함수의 고정 예외만 인식한다. 쿼리·입력값·detail에 섞인 문자열은 판정에 사용하지 않는다.
  const seen = new Set<object>();
  let current: unknown = error;
  while (typeof current === "object" && current !== null && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && current.code === "P0001" &&
        "message" in current && typeof current.message === "string") {
      const message = messages.get(current.message);
      if (message) return message;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return "학생 등록을 완료하지 못했습니다. 입력 내용과 서비스 상태를 확인해 주세요.";
}
