/** #151 업로드 발급·검증·정리 원장. 영구 제출물과 미확정 객체 정리를 분리한다. */
import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, timestamp, uniqueIndex, uuid, integer, varchar } from "drizzle-orm/pg-core";
import { assignmentUploadIntents } from "./academic-submissions";
import { assignmentTargets } from "./academic-assignments";
import { users } from "./schema";
export const academicUploadAuthorizations=pgTable("academic_upload_authorizations",{
  intentId:uuid("intent_id").primaryKey(),
  requestId:uuid("request_id").notNull().unique(),
  targetId:uuid("target_id").notNull(),
  userId:uuid("user_id").notNull(),
  originalName:varchar("original_name",{length:255}).notNull(),
  expectedSize:integer("expected_size").notNull(),
  receivedAt:timestamp("received_at",{withTimezone:true}),
  verifiedEtag:varchar("verified_etag",{length:255}),
  retiredAt:timestamp("retired_at",{withTimezone:true}),
  cleanupClaimedAt:timestamp("cleanup_claimed_at",{withTimezone:true}),
  deletedAt:timestamp("deleted_at",{withTimezone:true}),
},table=>[
  foreignKey({name:"academic_upload_authorizations_intent_fk",columns:[table.intentId],foreignColumns:[assignmentUploadIntents.id]}).onDelete("restrict"),
  foreignKey({name:"academic_upload_authorizations_target_fk",columns:[table.targetId],foreignColumns:[assignmentTargets.id]}).onDelete("restrict"),
  foreignKey({name:"academic_upload_authorizations_user_fk",columns:[table.userId],foreignColumns:[users.id]}).onDelete("restrict"),
  check("academic_upload_authorizations_size_check",sql`${table.expectedSize} BETWEEN 1 AND 52428800`),
  check("academic_upload_authorizations_name_check",sql`length(btrim(${table.originalName}))>0 AND ${table.originalName} !~ '[/\\\\[:cntrl:]]' AND lower(${table.originalName}) LIKE '%.pdf'`),
  uniqueIndex("academic_upload_authorizations_active_target_idx").on(table.targetId).where(sql`${table.retiredAt} IS NULL`),
  index("academic_upload_authorizations_cleanup_idx").on(table.cleanupClaimedAt),
]);
