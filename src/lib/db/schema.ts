import {
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  integer,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================
// Enums
// ============================================================

export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MEMBER"]);
export const recruitmentStatusEnum = pgEnum("recruitment_status", [
  "UPCOMING",
  "OPEN",
  "CLOSED",
]);
export const noticeStatusEnum = pgEnum("notice_status", [
  "DRAFT",
  "PUBLISHED",
]);

// ============================================================
// Users
// ============================================================

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull().default("MEMBER"),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const usersRelations = relations(users, ({ many }) => ({
  notices: many(notices),
  classLogs: many(classLogs),
}));

// ============================================================
// Cohorts (기수)
// ============================================================

export const cohorts = pgTable("cohorts", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(), // e.g., "1기", "2기"
  description: text("description"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  recruitmentStatus: recruitmentStatusEnum("recruitment_status")
    .notNull()
    .default("UPCOMING"),
  recruitmentStartDate: timestamp("recruitment_start_date"),
  recruitmentEndDate: timestamp("recruitment_end_date"),
  isActive: boolean("is_active").notNull().default(true),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const cohortsRelations = relations(cohorts, ({ many }) => ({
  applications: many(applications),
}));

// ============================================================
// Notices (공지사항)
// ============================================================

export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  content: text("content").notNull(),
  status: noticeStatusEnum("status").notNull().default("DRAFT"),
  pinned: boolean("pinned").notNull().default(false),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const noticesRelations = relations(notices, ({ one }) => ({
  author: one(users, {
    fields: [notices.authorId],
    references: [users.id],
  }),
}));

// ============================================================
// Class Logs (수업일지)
// ============================================================

export const classLogs = pgTable("class_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  content: text("content").notNull(),
  classDate: timestamp("class_date").notNull(),
  cohortId: uuid("cohort_id").references(() => cohorts.id, {
    onDelete: "set null",
  }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const classLogsRelations = relations(classLogs, ({ one, many }) => ({
  author: one(users, {
    fields: [classLogs.authorId],
    references: [users.id],
  }),
  cohort: one(cohorts, {
    fields: [classLogs.cohortId],
    references: [cohorts.id],
  }),
  images: many(classLogImages),
}));

export const classLogImages = pgTable("class_log_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  classLogId: uuid("class_log_id")
    .notNull()
    .references(() => classLogs.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 255 }),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const classLogImagesRelations = relations(
  classLogImages,
  ({ one }) => ({
    classLog: one(classLogs, {
      fields: [classLogImages.classLogId],
      references: [classLogs.id],
    }),
  })
);

// ============================================================
// Gallery (갤러리)
// ============================================================

export const galleries = pgTable("galleries", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const galleriesRelations = relations(galleries, ({ many }) => ({
  images: many(galleryImages),
}));

export const galleryImages = pgTable("gallery_images", {
  id: uuid("id").primaryKey().defaultRandom(),
  galleryId: uuid("gallery_id")
    .notNull()
    .references(() => galleries.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  alt: varchar("alt", { length: 255 }),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const galleryImagesRelations = relations(galleryImages, ({ one }) => ({
  gallery: one(galleries, {
    fields: [galleryImages.galleryId],
    references: [galleries.id],
  }),
}));

// ============================================================
// Applications (지원서)
// ============================================================

export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  cohortId: uuid("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "cascade" }),
  // 비회원 지원 — no login required
  applicantName: varchar("applicant_name", { length: 100 }).notNull(),
  applicantEmail: varchar("applicant_email", { length: 255 }).notNull(),
  applicantPhone: varchar("applicant_phone", { length: 20 }),
  university: varchar("university", { length: 100 }),
  major: varchar("major", { length: 100 }),
  motivation: text("motivation").notNull(),
  additionalInfo: text("additional_info"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
});

export const applicationsRelations = relations(applications, ({ one }) => ({
  cohort: one(cohorts, {
    fields: [applications.cohortId],
    references: [cohorts.id],
  }),
}));

// ============================================================
// Type exports
// ============================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Cohort = typeof cohorts.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type ClassLog = typeof classLogs.$inferSelect;
export type Gallery = typeof galleries.$inferSelect;
export type GalleryImage = typeof galleryImages.$inferSelect;
export type Application = typeof applications.$inferSelect;
