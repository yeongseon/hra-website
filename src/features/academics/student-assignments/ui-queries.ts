/** 학생 화면의 학적 없음 안내와 마감 표시를 위해 본인 학적 여부·DB 현재 시각만 조회한다. */
import "server-only";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { AcademicAccessError, requireAcademicStudent, withAcademicQueryErrors } from "@/lib/academic-permissions";

export async function getMyAcademicUiContext() {
  const { userId } = await requireAcademicStudent();
  return withAcademicQueryErrors(async () => {
    const result = await db.execute(sql`SELECT clock_timestamp() AS "serverNow", EXISTS (SELECT 1 FROM users WHERE id=${userId}::uuid AND role='MEMBER') AS authorized, EXISTS (
      SELECT 1 FROM academic_students s JOIN cohort_enrollments e ON e.student_id=s.id
      WHERE s.user_id=${userId}::uuid AND EXISTS(SELECT 1 FROM users WHERE id=${userId}::uuid AND role='MEMBER') AND e.status='ENROLLED' AND e.ended_at IS NULL
        AND e.enrolled_at<=clock_timestamp() AND e.created_at<=clock_timestamp()
    ) AS "hasActiveEnrollment"`);
    const parsed = z.object({ serverNow: z.coerce.date(), hasActiveEnrollment: z.boolean(), authorized: z.boolean() }).parse(result.rows[0]);
    if (!parsed.authorized) throw new AcademicAccessError("FORBIDDEN");
    return { serverNow: parsed.serverNow.toISOString(), hasActiveEnrollment: parsed.hasActiveEnrollment };
  });
}
