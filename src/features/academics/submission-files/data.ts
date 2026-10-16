/**
 * 최종 제출 파일의 현재 소유권 검사와 전달 허가 감사를 하나의 SQL로 확정합니다.
 * 행 잠금은 계정 연결·학적·역할·파일 참조의 변경과 감사 결정을 직렬화합니다.
 */
import "server-only";
import { sql } from "drizzle-orm";
import type { SubmissionFileReader } from "./access";

/** 클라이언트의 역할·기수·저장 경로를 받지 않고 세션에서 결정한 주체와 두 객체 ID만 받습니다. */
export function buildAuthorizedSubmissionFileRead(reader: SubmissionFileReader, submissionId: string, fileId: string) {
  return sql`
    WITH readable AS MATERIALIZED (
      SELECT f.id AS file_id, s.id AS submission_id, f.storage_key, f.original_name,
             f.mime_type, f.size_bytes, f.checksum
      FROM public.assignment_submission_files f
      JOIN public.assignment_submissions s ON s.id = f.submission_id
      JOIN public.assignment_targets t ON t.id = s.assignment_target_id
      JOIN public.assignments a ON a.id = t.assignment_id
      JOIN public.cohort_enrollments e ON e.id = t.enrollment_id
      JOIN public.academic_students student ON student.id = e.student_id
      JOIN public.users actor ON actor.id = ${reader.userId}::uuid
      WHERE f.id = ${fileId}::uuid AND s.id = ${submissionId}::uuid
        AND e.cohort_id = a.cohort_id
        AND (
          (${reader.scope}::text = 'MANAGEMENT' AND actor.id = ${reader.approverId}::uuid
            AND actor.role IN ('ADMIN', 'FACULTY', 'MEMBER'))
          OR
          (${reader.scope}::text = 'OWNER' AND actor.role = 'MEMBER'
            AND s.submitted_by_user_id = actor.id AND student.user_id = actor.id
            AND e.status = 'ENROLLED' AND e.ended_at IS NULL
            AND e.enrolled_at <= CURRENT_TIMESTAMP AND e.created_at <= CURRENT_TIMESTAMP
            AND a.status IN ('PUBLISHED', 'CLOSED') AND a.published_at IS NOT NULL
            AND a.due_at IS NOT NULL AND a.published_at <= CURRENT_TIMESTAMP)
        )
      FOR SHARE OF actor, student, e, a, t, s, f
    ), recorded AS (
      INSERT INTO public.academic_submission_file_reads (actor_user_id, submission_id, file_id, access_scope)
      SELECT ${reader.userId}::uuid, submission_id, file_id, ${reader.scope}::text FROM readable
      RETURNING id, file_id
    )
    SELECT readable.storage_key, readable.original_name, readable.mime_type,
           readable.size_bytes, readable.checksum, recorded.id AS access_id
    FROM readable JOIN recorded USING (file_id)
  `;
}
