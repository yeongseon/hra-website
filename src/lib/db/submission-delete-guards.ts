/**
 * #193 보호 외래키가 운영 DB에 적용됐는지 확인합니다.
 * 마이그레이션 전후 배포 순서가 달라도 상위 항목 삭제를 막아 제출 유실을 방지합니다.
 */
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export async function hasSubmissionDeleteGuards(): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT count(*)::integer AS protected_count
    FROM pg_constraint
    WHERE (
      conrelid = 'public.application_submissions'::regclass
      AND confrelid = 'public.application_forms'::regclass
      AND conname = 'application_submissions_form_id_application_forms_id_fk'
      AND confdeltype = 'r'
    ) OR (
      conrelid = 'public.applications'::regclass
      AND confrelid = 'public.cohorts'::regclass
      AND conname = 'applications_cohort_id_cohorts_id_fk'
      AND confdeltype = 'r'
    )
  `);
  return result.rows[0]?.protected_count === 2;
}
