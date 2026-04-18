/**
 * 데이터베이스 스키마 정의 파일
 *
 * 이 파일은 PostgreSQL 데이터베이스의 테이블 구조를 정의합니다.
 * Drizzle ORM을 사용하여 타입-안전한 데이터베이스 접근을 제공합니다.
 *
 * 포함된 테이블:
 * - users: 사용자 정보 (관리자/멤버)
 * - cohorts: HRA의 기수 정보 (1기, 2기, ...)
 * - notices: 공지사항
 * - classLogs: 수업일지
 * - classLogImages: 수업일지의 이미지들
 * - galleries: 갤러리 (여러 이미지를 모아놓은 앨범)
 * - galleryImages: 갤러리에 포함된 이미지들
 * - applications: 동아리 지원서
 */

// Drizzle ORM의 PostgreSQL 데이터 타입들
// 테이블 생성, 컬럼 타입, UUID 등을 정의할 때 사용
import {
  pgTable, // PostgreSQL 테이블 정의 함수
  text, // 긴 텍스트 저장 (varchar 제한 없음)
  timestamp, // 시간/날짜 저장
  varchar, // 제한된 길이의 텍스트 저장
  boolean, // true/false 저장
  integer, // 정수 저장
  pgEnum, // PostgreSQL의 enum 타입 (정해진 선택지만 가능)
  uuid, // 고유 ID 저장 (128비트 무작위 값)
} from "drizzle-orm/pg-core";

// Drizzle ORM의 관계 설정 함수
// 테이블 간의 1:1, 1:N 관계를 정의할 때 사용
import { relations } from "drizzle-orm";

// ============================================================
// Enums (열거형 - 정해진 선택지만 가능한 데이터 타입)
// ============================================================

// 사용자의 역할 종류
// - ADMIN: 관리자 (공지사항, 수업일지 작성 권한 있음)
// - MEMBER: 일반 멤버 (제한된 권한)
export const userRoleEnum = pgEnum("user_role", ["ADMIN", "MEMBER"]);

// 동아리 모집 상태
// - UPCOMING: 곧 시작될 예정
// - OPEN: 현재 모집 중
// - CLOSED: 모집 완료/종료됨
export const recruitmentStatusEnum = pgEnum("recruitment_status", [
  "UPCOMING",
  "OPEN",
  "CLOSED",
]);

// 공지사항 상태
// - DRAFT: 작성 중 (아직 게시되지 않음)
// - PUBLISHED: 게시됨 (사용자에게 보임)
export const noticeStatusEnum = pgEnum("notice_status", [
  "DRAFT",
  "PUBLISHED",
]);

// 지원서 처리 상태
// - PENDING: 검토 대기 중 (기본값)
// - ACCEPTED: 합격
// - REJECTED: 불합격
export const applicationStatusEnum = pgEnum("application_status", [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
]);

// ============================================================
// Users (사용자 테이블)
// ============================================================

// 회원 정보를 저장하는 테이블
// 사이트에 가입한 관리자, 멤버들의 계정 정보를 관리합니다.
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(), // 사용자 고유 ID (자동 생성)
  name: varchar("name", { length: 100 }).notNull(), // 사용자 이름 (최대 100자)
  email: varchar("email", { length: 255 }).notNull().unique(), // 이메일 (중복 불가, 로그인할 때 사용)
  passwordHash: text("password_hash"), // 비밀번호를 암호화한 값 (소셜 로그인 사용자는 null)
  role: userRoleEnum("role").notNull().default("MEMBER"), // 사용자 역할 (기본값: 일반 멤버)
  image: text("image"), // 프로필 사진 URL (선택사항)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 계정 생성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간 (수정할 때마다 자동 업데이트)
});

// Users 테이블과 다른 테이블의 관계 정의
// 한 사용자가 여러 개의 공지사항과 수업일지를 작성할 수 있음
export const usersRelations = relations(users, ({ many }) => ({
  notices: many(notices), // 이 사용자가 작성한 모든 공지사항
  classLogs: many(classLogs), // 이 사용자가 작성한 모든 수업일지
}));

// ============================================================
// Cohorts (기수 테이블)
// ============================================================

// HRA의 각 기수(기간) 정보를 저장하는 테이블
// 1기, 2기, 3기, ... 와 같은 기수별로 모집 일정, 상태 등을 관리합니다.
export const cohorts = pgTable("cohorts", {
  id: uuid("id").primaryKey().defaultRandom(), // 기수 고유 ID (자동 생성)
  name: varchar("name", { length: 100 }).notNull(), // 기수 이름 (예: "1기", "2기")
  description: text("description"), // 기수에 대한 설명 (선택사항)
  startDate: timestamp("start_date"), // 기수 시작 날짜 (선택사항)
  endDate: timestamp("end_date"), // 기수 종료 날짜 (선택사항)
  recruitmentStatus: recruitmentStatusEnum("recruitment_status")
    .notNull()
    .default("UPCOMING"), // 모집 상태 (기본값: 곧 시작될 예정)
  recruitmentStartDate: timestamp("recruitment_start_date"), // 모집 시작 날짜
  recruitmentEndDate: timestamp("recruitment_end_date"), // 모집 종료 날짜
  googleFormUrl: text("google_form_url"), // 이 기수의 구글폼 링크 (선택사항, 지원 버튼 연결에 사용)
  googleSheetId: text("google_sheet_id"), // 이 기수와 연결된 구글 시트 ID (선택사항, 응답 데이터 조회에 사용)
  isActive: boolean("is_active").notNull().default(true), // 현재 활성 기수인지 여부 (기본값: 활성)
  order: integer("order").notNull().default(0), // 기수 표시 순서 (숫자가 작을수록 먼저 표시됨)
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").notNull().defaultNow(), // 기수 생성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Cohorts 테이블과 다른 테이블의 관계 정의
// 한 기수에 여러 지원서가 제출될 수 있음
export const cohortsRelations = relations(cohorts, ({ many }) => ({
  applications: many(applications), // 이 기수에 제출된 모든 지원서
}));

// ============================================================
// Notices (공지사항 테이블)
// ============================================================

// 동아리 공지사항을 저장하는 테이블
// 운영진이 작성하는 공지사항, 소식 등을 관리합니다.
export const notices = pgTable("notices", {
  id: uuid("id").primaryKey().defaultRandom(), // 공지사항 고유 ID (자동 생성)
  title: varchar("title", { length: 300 }).notNull(), // 공지사항 제목 (최대 300자)
  content: text("content").notNull(), // 공지사항 본문 (길이 제한 없음)
  status: noticeStatusEnum("status").notNull().default("DRAFT"), // 공지사항 상태 (기본값: 작성 중)
  pinned: boolean("pinned").notNull().default(false), // 고정 공지사항인지 여부 (기본값: 고정 아님)
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // 작성자 ID (사용자가 삭제되면 공지사항도 삭제됨)
  viewCount: integer("view_count").notNull().default(0), // 조회수 (기본값: 0)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 공지사항 작성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Notices 테이블과 다른 테이블의 관계 정의
// 각 공지사항은 정확히 한 명의 작성자를 가짐
export const noticesRelations = relations(notices, ({ one }) => ({
  author: one(users, { // 이 공지사항을 작성한 사용자 정보
    fields: [notices.authorId],
    references: [users.id],
  }),
}));

// ============================================================
// Class Logs (수업일지 테이블)
// ============================================================

// 각 수업의 내용, 진행 상황 등을 기록하는 테이블
// 운영진이 진행한 수업에 대한 요약, 사진 등을 저장합니다.
export const classLogs = pgTable("class_logs", {
  id: uuid("id").primaryKey().defaultRandom(), // 수업일지 고유 ID (자동 생성)
  title: varchar("title", { length: 300 }).notNull(), // 수업 제목 (최대 300자)
  content: text("content").notNull(), // 수업 내용 (길이 제한 없음)
  classDate: timestamp("class_date").notNull(), // 수업이 진행된 날짜/시간
  cohortId: uuid("cohort_id").references(() => cohorts.id, { // 어느 기수의 수업인지 (선택사항, 기수 삭제되면 null로 설정됨)
    onDelete: "set null",
  }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }), // 작성자 ID (사용자가 삭제되면 수업일지도 삭제됨)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 수업일지 작성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Class Logs 테이블과 다른 테이블의 관계 정의
// 한 수업일지는 한 명의 작성자, 한 기수에 속하며, 여러 사진을 가질 수 있음
export const classLogsRelations = relations(classLogs, ({ one, many }) => ({
  author: one(users, { // 이 수업일지를 작성한 사용자
    fields: [classLogs.authorId],
    references: [users.id],
  }),
  cohort: one(cohorts, { // 이 수업이 진행된 기수
    fields: [classLogs.cohortId],
    references: [cohorts.id],
  }),
  images: many(classLogImages), // 이 수업일지에 포함된 모든 사진
}));

// 수업일지 이미지 테이블
// 수업일지에 첨부되는 사진들을 저장합니다.
export const classLogImages = pgTable("class_log_images", {
  id: uuid("id").primaryKey().defaultRandom(), // 이미지 고유 ID (자동 생성)
  classLogId: uuid("class_log_id")
    .notNull()
    .references(() => classLogs.id, { onDelete: "cascade" }), // 어느 수업일지에 속하는지 (수업일지 삭제되면 이미지도 삭제됨)
  url: text("url").notNull(), // 이미지의 웹 주소 (URL)
  alt: varchar("alt", { length: 255 }), // 이미지 설명 (접근성을 위함, 선택사항)
  order: integer("order").notNull().default(0), // 사진 표시 순서 (숫자가 작을수록 먼저 표시됨)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 이미지 업로드 시간
});

// Class Log Images 테이블과 다른 테이블의 관계 정의
// 각 이미지는 정확히 하나의 수업일지에 속함
export const classLogImagesRelations = relations(
  classLogImages,
  ({ one }) => ({
    classLog: one(classLogs, { // 이 이미지가 속한 수업일지
      fields: [classLogImages.classLogId],
      references: [classLogs.id],
    }),
  })
);

// ============================================================
// Gallery (갤러리 테이블)
// ============================================================

// 여러 사진을 모아놓은 앨범 정보를 저장하는 테이블
// 특정 주제나 행사별로 사진들을 관리합니다.
export const galleries = pgTable("galleries", {
  id: uuid("id").primaryKey().defaultRandom(), // 갤러리 고유 ID (자동 생성)
  title: varchar("title", { length: 300 }).notNull(), // 갤러리 제목 (최대 300자)
  description: text("description"), // 갤러리 설명 (선택사항)
  coverImageUrl: text("cover_image_url"), // 갤러리 커버 사진 URL (앨범 썸네일, 선택사항)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 갤러리 생성 시간
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()), // 마지막 수정 시간
});

// Gallery 테이블과 다른 테이블의 관계 정의
// 한 갤러리는 여러 사진을 가질 수 있음
export const galleriesRelations = relations(galleries, ({ many }) => ({
  images: many(galleryImages), // 이 갤러리에 포함된 모든 사진
}));

// 갤러리 이미지 테이블
// 갤러리에 포함되는 개별 사진들을 저장합니다.
export const galleryImages = pgTable("gallery_images", {
  id: uuid("id").primaryKey().defaultRandom(), // 이미지 고유 ID (자동 생성)
  galleryId: uuid("gallery_id")
    .notNull()
    .references(() => galleries.id, { onDelete: "cascade" }), // 어느 갤러리에 속하는지 (갤러리 삭제되면 이미지도 삭제됨)
  url: text("url").notNull(), // 이미지의 웹 주소 (URL)
  alt: varchar("alt", { length: 255 }), // 이미지 설명 (접근성을 위함, 선택사항)
  order: integer("order").notNull().default(0), // 사진 표시 순서 (숫자가 작을수록 먼저 표시됨)
  createdAt: timestamp("created_at").notNull().defaultNow(), // 이미지 업로드 시간
});

// Gallery Images 테이블과 다른 테이블의 관계 정의
// 각 이미지는 정확히 하나의 갤러리에 속함
export const galleryImagesRelations = relations(galleryImages, ({ one }) => ({
  gallery: one(galleries, { // 이 이미지가 속한 갤러리
    fields: [galleryImages.galleryId],
    references: [galleries.id],
  }),
}));

// ============================================================
// Applications (지원서 테이블)
// ============================================================

// 동아리에 지원한 사람들의 지원서를 저장하는 테이블
// 로그인하지 않은 비회원도 지원할 수 있으므로 이름/이메일/전화번호는 직접 입력받습니다.
export const applications = pgTable("applications", {
  id: uuid("id").primaryKey().defaultRandom(), // 지원서 고유 ID (자동 생성)
  cohortId: uuid("cohort_id")
    .notNull()
    .references(() => cohorts.id, { onDelete: "cascade" }), // 어느 기수에 지원했는지 (기수 삭제되면 지원서도 삭제됨)
  applicantName: varchar("applicant_name", { length: 100 }).notNull(), // 지원자 이름 (최대 100자)
  applicantEmail: varchar("applicant_email", { length: 255 }).notNull(), // 지원자 이메일 (최대 255자)
  applicantPhone: varchar("applicant_phone", { length: 20 }), // 지원자 전화번호 (선택사항)
  university: varchar("university", { length: 100 }), // 지원자 대학교 (선택사항)
  major: varchar("major", { length: 100 }), // 지원자 전공 (선택사항)
  motivation: text("motivation").notNull(), // 지원 동기/자기소개 (길이 제한 없음)
  additionalInfo: text("additional_info"), // 추가 정보/특이사항 (선택사항)
  status: applicationStatusEnum("status").notNull().default("PENDING"), // 지원서 처리 상태 (기본값: 검토 대기)
  submittedAt: timestamp("submitted_at").notNull().defaultNow(), // 지원서 제출 시간
});

// Applications 테이블과 다른 테이블의 관계 정의
// 각 지원서는 정확히 하나의 기수에 속함
export const applicationsRelations = relations(applications, ({ one }) => ({
  cohort: one(cohorts, { // 이 지원서가 속한 기수
    fields: [applications.cohortId],
    references: [cohorts.id],
  }),
}));

// ============================================================
// Faculty (교수진 테이블)
// ============================================================

// 교수진 카테고리
// - CLASSICS: 고전읽기
// - BUSINESS: 기업실무
// - LECTURE: 특강
export const facultyCategoryEnum = pgEnum("faculty_category", [
  "CLASSICS",
  "BUSINESS",
  "LECTURE",
]);

// 교수진 정보를 저장하는 테이블
export const faculty = pgTable("faculty", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  category: facultyCategoryEnum("category").notNull(),
  currentPosition: text("current_position"), // 현직 (現)
  formerPosition: text("former_position"), // 전직 (前)
  imageUrl: text("image_url"), // 프로필 이미지 URL (선택사항)
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Alumni Stories (수료생 이야기 테이블)
// ============================================================

// 수료생 이야기를 저장하는 테이블
export const alumniStories = pgTable("alumni_stories", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(), // 수료생 이름
  title: varchar("title", { length: 100 }), // 소속/직함
  quote: varchar("quote", { length: 500 }).notNull(), // 인용 문구 (제목)
  content: text("content").notNull(), // 본문 내용
  imageUrl: text("image_url"), // 수료생 사진 URL
  isFeatured: boolean("is_featured").notNull().default(false), // 메인 페이지 배너 노출 여부
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// FAQ Contact (FAQ 담당자 연락처 테이블)
// ============================================================

// FAQ 페이지에 표시할 담당자 연락처 정보
export const faqContact = pgTable("faq_contact", {
  id: uuid("id").primaryKey().defaultRandom(),
  cohortName: varchar("cohort_name", { length: 50 }).notNull(), // 기수명 (예: "20기")
  contactName: varchar("contact_name", { length: 100 }).notNull(), // 담당자명
  contactPhone: varchar("contact_phone", { length: 20 }).notNull(), // 전화번호
  contactRole: varchar("contact_role", { length: 100 }).notNull().default("모집위원장"), // 역할
  isActive: boolean("is_active").notNull().default(true),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Recruitment Settings (모집 설정 테이블)
// ============================================================

// 모집 안내 페이지의 설정 정보 (포스터, D-day 등)
export const recruitmentSettings = pgTable("recruitment_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  posterImageUrl: text("poster_image_url"), // 모집 포스터 이미지 URL
  deadlineDate: timestamp("deadline_date"), // D-day 기준 마감일
  nextRecruitmentYear: integer("next_recruitment_year"), // 다음 모집 예정 연도
  nextRecruitmentMonth: integer("next_recruitment_month"), // 다음 모집 예정 월
  qualificationText: text("qualification_text"), // 지원 자격 안내 문구
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Notice Attachments (공지사항 첨부파일 테이블)
// ============================================================

// 공지사항에 첨부되는 파일/이미지를 저장합니다.
export const noticeAttachments = pgTable("notice_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  noticeId: uuid("notice_id")
    .notNull()
    .references(() => notices.id, { onDelete: "cascade" }),
  url: text("url").notNull(), // 파일 URL
  fileName: varchar("file_name", { length: 500 }).notNull(), // 원본 파일명
  fileSize: integer("file_size"), // 파일 크기 (bytes)
  fileType: varchar("file_type", { length: 100 }), // MIME type
  isImage: boolean("is_image").notNull().default(false), // 이미지 여부
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Notice Attachments 관계 정의
export const noticeAttachmentsRelations = relations(noticeAttachments, ({ one }) => ({
  notice: one(notices, {
    fields: [noticeAttachments.noticeId],
    references: [notices.id],
  }),
}));

// ============================================================
// Weekly Texts (주차별 텍스트 테이블)
// ============================================================

// 자료실의 주차별 텍스트를 저장합니다.
export const weeklyTexts = pgTable("weekly_texts", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  fileUrl: text("file_url").notNull(), // 파일 URL
  fileName: varchar("file_name", { length: 500 }).notNull(),
  cohortId: uuid("cohort_id").references(() => cohorts.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Weekly Texts 관계 정의
export const weeklyTextsRelations = relations(weeklyTexts, ({ one }) => ({
  cohort: one(cohorts, {
    fields: [weeklyTexts.cohortId],
    references: [cohorts.id],
  }),
}));

// ============================================================
// Guidebooks (가이드북 테이블)
// ============================================================

// 자료실의 가이드북을 저장합니다.
export const guidebooks = pgTable("guidebooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  fileUrl: text("file_url").notNull(),
  fileName: varchar("file_name", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const pressArticles = pgTable("press_articles", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: varchar("title", { length: 300 }).notNull(),
  source: varchar("source", { length: 200 }).notNull(),
  url: text("url").notNull(),
  publishedAt: timestamp("published_at").notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ============================================================
// Type exports (타입 내보내기)
// ============================================================

// Drizzle ORM은 데이터베이스 테이블을 정의한 후 자동으로 TypeScript 타입을 생성할 수 있습니다.
// 아래 타입들은 데이터베이스 데이터를 코드에서 사용할 때 타입 검사를 제공합니다.

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Cohort = typeof cohorts.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type ClassLog = typeof classLogs.$inferSelect;
export type Gallery = typeof galleries.$inferSelect;
export type GalleryImage = typeof galleryImages.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Faculty = typeof faculty.$inferSelect;
export type AlumniStory = typeof alumniStories.$inferSelect;
export type FaqContactInfo = typeof faqContact.$inferSelect;
export type RecruitmentSetting = typeof recruitmentSettings.$inferSelect;
export type NoticeAttachment = typeof noticeAttachments.$inferSelect;
export type WeeklyText = typeof weeklyTexts.$inferSelect;
export type Guidebook = typeof guidebooks.$inferSelect;
export type PressArticle = typeof pressArticles.$inferSelect;
