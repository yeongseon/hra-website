/**
 * 개인 제출 파일의 전달 허가 감사 모델입니다.
 * 사용자·제출·파일 식별자와 권한 근거·시각만 남기고 이름·본문·저장 키·URL은 저장하지 않습니다.
 * 수정·삭제 방지 트리거는 범위 migration을 함께 적용해야 합니다.
 */
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./schema";
import { assignmentSubmissionFiles, assignmentSubmissions } from "./academic-submissions";

export const academicSubmissionFileReads = pgTable("academic_submission_file_reads", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").notNull(),
  submissionId: uuid("submission_id").notNull(),
  fileId: uuid("file_id").notNull(),
  accessScope: text("access_scope").notNull(),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }).notNull().default(sql`clock_timestamp()`),
}, (table) => [
  foreignKey({ name: "academic_submission_file_reads_actor_fk", columns: [table.actorUserId], foreignColumns: [users.id] }).onDelete("restrict"),
  foreignKey({ name: "academic_submission_file_reads_submission_fk", columns: [table.submissionId], foreignColumns: [assignmentSubmissions.id] }).onDelete("restrict"),
  foreignKey({ name: "academic_submission_file_reads_file_fk", columns: [table.fileId], foreignColumns: [assignmentSubmissionFiles.id] }).onDelete("restrict"),
  check("academic_submission_file_reads_scope_check", sql`${table.accessScope} IN ('OWNER', 'MANAGEMENT')`),
  index("academic_submission_file_reads_actor_time_idx").on(table.actorUserId, table.authorizedAt),
  index("academic_submission_file_reads_file_time_idx").on(table.fileId, table.authorizedAt),
]);
