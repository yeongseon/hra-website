/**
 * G1 과제 정의와 최초 공개 대상 스냅샷의 Drizzle 모델이다.
 * schema.ts에서 내보내어 DB/Drizzle Kit가 함께 발견한다. 공개·불변 트리거와
 * publish_academic_assignment 함수는 범위 SQL migration으로 반드시 함께 적용한다.
 */
import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, unique, uuid, varchar } from "drizzle-orm/pg-core";
import { cohortEnrollments, cohorts, scheduleEvents, scheduleSessions, users } from "./schema";

// 공개 후에는 다시 초안으로 되돌리지 않으며 종료만 허용한다.
export const assignmentStatusEnum = pgEnum("assignment_status", ["DRAFT", "PUBLISHED", "CLOSED"]);

// 안내 내용과 기수·수업·마감은 최초 공개 후 불변이다. 모든 참조는 삭제를 제한한다.
export const assignments = pgTable("assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  cohortId: uuid("cohort_id").notNull().references(() => cohorts.id, { onDelete: "restrict" }),
  scheduleEventId: uuid("schedule_event_id").references(() => scheduleEvents.id, { onDelete: "restrict" }),
  scheduleSessionId: uuid("schedule_session_id").references(() => scheduleSessions.id, { onDelete: "restrict" }),
  title: varchar("title", { length: 200 }).notNull(),
  instructions: text("instructions").notNull().default(""),
  dueAt: timestamp("due_at", { withTimezone: true }),
  status: assignmentStatusEnum("status").notNull().default("DRAFT"),
  createdByUserId: uuid("created_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  publishedByUserId: uuid("published_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, table => [
  check("assignments_title_not_blank", sql`length(btrim(${table.title})) > 0`),
  check("assignments_instructions_length", sql`length(${table.instructions}) <= 50000`),
  check("assignments_session_requires_event", sql`${table.scheduleSessionId} IS NULL OR ${table.scheduleEventId} IS NOT NULL`),
  check("assignments_publication_shape", sql`(${table.status} = 'DRAFT' AND ${table.publishedAt} IS NULL AND ${table.publishedByUserId} IS NULL) OR (${table.status} <> 'DRAFT' AND ${table.publishedAt} IS NOT NULL AND ${table.publishedByUserId} IS NOT NULL AND ${table.dueAt} IS NOT NULL AND ${table.dueAt} > ${table.publishedAt})`),
  index("assignments_cohort_status_due_idx").on(table.cohortId, table.status, table.dueAt),
]);

// 현재 등록 명부 대신 이 행을 제출률 분모와 제출 인가의 기준으로 사용한다.
export const assignmentTargets = pgTable("assignment_targets", {
  id: uuid("id").primaryKey().defaultRandom(),
  assignmentId: uuid("assignment_id").notNull().references(() => assignments.id, { onDelete: "restrict" }),
  enrollmentId: uuid("enrollment_id").notNull().references(() => cohortEnrollments.id, { onDelete: "restrict" }),
  assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull(),
  assignedByUserId: uuid("assigned_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
}, table => [
  unique("assignment_targets_assignment_enrollment_unique").on(table.assignmentId, table.enrollmentId),
  index("assignment_targets_enrollment_idx").on(table.enrollmentId),
]);

// 서버 액션과 학생별 조회에서 사용할 타입을 모델과 함께 내보낸다.
export type Assignment = typeof assignments.$inferSelect;
export type NewAssignment = typeof assignments.$inferInsert;
export type AssignmentTarget = typeof assignmentTargets.$inferSelect;
