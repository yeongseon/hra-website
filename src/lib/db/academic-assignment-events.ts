/** 과제 변경의 최소 감사 모델입니다. 제목·본문·원본 요청은 복제하지 않습니다. */
import { sql } from "drizzle-orm";
import { check, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { assignments } from "./academic-assignments";
import { users } from "./schema";

export const academicAssignmentEvents = pgTable("academic_assignment_events", {
  requestId: uuid("request_id").primaryKey(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  previousStatus: text("previous_status"),
  nextStatus: text("next_status").notNull(),
  correlationId: uuid("correlation_id").notNull(),
  payloadDigest: varchar("payload_digest", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, table => [
  check("academic_assignment_events_action_check", sql`${table.action} IN ('CREATE','UPDATE_DRAFT','PUBLISH','CLOSE')`),
  check("academic_assignment_events_previous_status_check", sql`${table.previousStatus} IS NULL OR ${table.previousStatus} IN ('DRAFT','PUBLISHED','CLOSED')`),
  check("academic_assignment_events_next_status_check", sql`${table.nextStatus} IN ('DRAFT','PUBLISHED','CLOSED')`),
  check("academic_assignment_events_payload_digest_check", sql`${table.payloadDigest} ~ '^[0-9a-f]{64}$'`),
]);
