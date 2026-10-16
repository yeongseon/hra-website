/**
 * G1 최종 제출, 검증된 단일 파일, 임시 업로드 의도를 구분하는 Drizzle 모델이다.
 * 최종화 함수와 지연 참조 제약은 migrate-academic-submissions.sql을 함께 적용해야 한다.
 * 서버만 업로드 검증 상태를 기록하며 실제 Blob 소유권 검증과 업무 인가는 별도 계층에서 수행한다.
 */
import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgEnum, pgTable, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./schema";
import { assignmentTargets } from "./academic-assignments";

// 업로드 성공과 제출 완료를 구분한다. 만료는 시각으로 판단하고 미검증 의도만 명시적으로 종료한다.
export const assignmentUploadStateEnum = pgEnum("assignment_upload_state", ["INTENDED", "VERIFIED", "CONSUMED", "EXPIRED"]);

export const assignmentUploadIntents = pgTable("assignment_upload_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentTargetId: uuid("assignment_target_id").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  storageKey: varchar("storage_key", { length: 1024 }).notNull(),
  state: assignmentUploadStateEnum("state").notNull().default("INTENDED"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  originalName: varchar("original_name", { length: 255 }),
  mimeType: varchar("mime_type", { length: 100 }),
  sizeBytes: integer("size_bytes"),
  checksum: varchar("checksum", { length: 64 }),
}, table => [
  foreignKey({ name: "assignment_upload_intents_target_fk", columns: [table.assignmentTargetId], foreignColumns: [assignmentTargets.id] }).onDelete("restrict"),
  unique("assignment_upload_intents_storage_key_unique").on(table.storageKey),
  unique("assignment_upload_intents_identity_unique").on(table.id, table.assignmentTargetId, table.userId),
  check("assignment_upload_intents_key_shape", sql`length(btrim(${table.storageKey})) > 0 AND ${table.storageKey} !~ '(^/|://|(^|/)\\.\\.(/|$)|[[:cntrl:]])'`),
  check("assignment_upload_intents_expiry_shape", sql`isfinite(${table.createdAt}) AND isfinite(${table.expiresAt}) AND ${table.expiresAt} > ${table.createdAt}`),
  check("assignment_upload_intents_verification_shape", sql`(${table.state} IN ('INTENDED', 'EXPIRED') AND ${table.verifiedAt} IS NULL AND ${table.originalName} IS NULL AND ${table.mimeType} IS NULL AND ${table.sizeBytes} IS NULL AND ${table.checksum} IS NULL) OR (${table.state} IN ('VERIFIED', 'CONSUMED') AND ${table.verifiedAt} IS NOT NULL AND isfinite(${table.verifiedAt}) AND ${table.verifiedAt} >= ${table.createdAt} AND ${table.verifiedAt} < ${table.expiresAt} AND ${table.originalName} IS NOT NULL AND length(btrim(${table.originalName})) > 0 AND ${table.originalName} !~ '[/\\\\[:cntrl:]]' AND ${table.mimeType} IS NOT NULL AND ${table.mimeType} = 'application/pdf' AND ${table.sizeBytes} IS NOT NULL AND ${table.sizeBytes} BETWEEN 1 AND 52428800 AND ${table.checksum} IS NOT NULL AND ${table.checksum} ~ '^[0-9a-f]{64}$')`),
  index("assignment_upload_intents_target_user_idx").on(table.assignmentTargetId, table.userId),
  index("assignment_upload_intents_state_expiry_idx").on(table.state, table.expiresAt),
]);

// 최종 제출만 저장한다. 한 대상당 한 행과 전역 UUID 멱등 키를 DB가 보장한다.
export const assignmentSubmissions = pgTable("assignment_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentTargetId: uuid("assignment_target_id").notNull(),
  submittedByUserId: uuid("submitted_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  uploadIntentId: uuid("upload_intent_id").notNull(),
  submissionKey: uuid("submission_key").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  foreignKey({ name: "assignment_submissions_target_fk", columns: [table.assignmentTargetId], foreignColumns: [assignmentTargets.id] }).onDelete("restrict"),
  unique("assignment_submissions_target_unique").on(table.assignmentTargetId),
  unique("assignment_submissions_key_unique").on(table.submissionKey),
  unique("assignment_submissions_intent_unique").on(table.uploadIntentId),
  foreignKey({ name: "assignment_submissions_intent_identity_fk", columns: [table.uploadIntentId, table.assignmentTargetId, table.submittedByUserId], foreignColumns: [assignmentUploadIntents.id, assignmentUploadIntents.assignmentTargetId, assignmentUploadIntents.userId] }).onDelete("restrict"),
  check("assignment_submissions_time_finite", sql`isfinite(${table.submittedAt})`),
  index("assignment_submissions_user_time_idx").on(table.submittedByUserId, table.submittedAt),
]);

// 제출 ID의 유일성으로 파일 한 개만 허용한다. 서버가 검증한 메타와 일치해야 커밋된다.
export const assignmentSubmissionFiles = pgTable("assignment_submission_files", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull(),
  storageKey: varchar("storage_key", { length: 1024 }).notNull(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(),
}, table => [
  foreignKey({ name: "assignment_submission_files_submission_fk", columns: [table.submissionId], foreignColumns: [assignmentSubmissions.id] }).onDelete("restrict"),
  unique("assignment_submission_files_submission_unique").on(table.submissionId),
  unique("assignment_submission_files_storage_key_unique").on(table.storageKey),
  check("assignment_submission_files_metadata_shape", sql`length(btrim(${table.storageKey})) > 0 AND ${table.storageKey} !~ '(^/|://|(^|/)\\.\\.(/|$)|[[:cntrl:]])' AND length(btrim(${table.originalName})) > 0 AND ${table.originalName} !~ '[/\\\\[:cntrl:]]' AND ${table.mimeType} = 'application/pdf' AND ${table.sizeBytes} BETWEEN 1 AND 52428800 AND ${table.checksum} ~ '^[0-9a-f]{64}$'`),
]);

// 후속 서버 액션과 관리 조회가 모델에서 타입을 공유한다.
export type AssignmentUploadIntent = typeof assignmentUploadIntents.$inferSelect;
export type AssignmentSubmission = typeof assignmentSubmissions.$inferSelect;
export type AssignmentSubmissionFile = typeof assignmentSubmissionFiles.$inferSelect;
