// @vitest-environment node
/**
 * 관리자 쓰기 경로 전체 감사: 실제 서버 액션·Drizzle·Neon 전송·격리 PostgreSQL을 연결합니다.
 * 18모듈의 명명 규칙상 64개 쓰기와 이미지 추가·조회수 증가 2개를 명시적으로 매핑합니다.
 * 인증 세션·Next 캐시/이동과 외부 Blob 응답만 격리하며 SQL·인가 함수·업로드 검증은 실제입니다.
 * 지원서 제출·삭제의 배치도 단일 PostgreSQL 트랜잭션에서 실행하고 실패 시 롤백을 확인합니다.
 * HRA_TEST_PG_BIN만 지정하면 저장소 스키마를 실행 시 내보내며 별도 SQL 파일은 필요 없습니다.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";
import { createPsqlBatchTransport } from "../support/neon-psql-batch-transport.mjs";
import { exportQaSchemaSql } from "../support/qa-schema-export.mjs";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), revalidatePath: vi.fn(), logServerError: vi.fn(),
  put: vi.fn(), head: vi.fn(), del: vi.fn(),
  database: undefined as NeonHttpDatabase<typeof schema> | undefined,
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError, redactBlobUrl: () => "합성 저장소" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/blob-host", () => ({ projectBlobHost: "routeaudit.public.blob.vercel-storage.com" }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, head: mocks.head, del: mocks.del }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));

import * as alumni from "@/features/alumni/actions";
import * as forms from "@/features/applications/actions/forms";
import * as questions from "@/features/applications/actions/questions";
import * as submissions from "@/features/applications/actions/submissions";
import * as logs from "@/features/class-logs/actions";
import * as materials from "@/features/class-materials/actions";
import * as faculty from "@/features/faculty/actions";
import * as faq from "@/features/faq/actions";
import * as gallery from "@/features/gallery/actions";
import * as guidebooks from "@/features/guidebooks/actions";
import * as notices from "@/features/notices/actions";
import * as press from "@/features/press/actions";
import * as recruitment from "@/features/recruitment/actions";
import * as settings from "@/features/recruitment-settings/actions";
import * as templates from "@/features/report-templates/actions";
import * as schedule from "@/features/schedule/actions";
import * as users from "@/features/users/actions";
import * as weekly from "@/features/weekly-texts/actions";

const actor = "10000000-0000-4000-8000-000000000001";
const member = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const otherCohort = "20000000-0000-4000-8000-000000000002";
// 서로 다른 테이블의 기준 행은 같은 합성 UUID를 사용해 검사 대상을 고정합니다.
const id = "30000000-0000-4000-8000-000000000001";
const child = "30000000-0000-4000-8000-000000000002";
const otherChild = "30000000-0000-4000-8000-000000000003";
const requestId = "40000000-0000-4000-8000-000000000001";
const invalidId = "잘못된-식별자";
const blobOrigin = "https://routeaudit.public.blob.vercel-storage.com";
const changedTitle = "합성 변경 자료";
const emptyState = { success: false, message: "" };
const bodyForm = (values: Record<string, string>) => {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
};
const articleForm = () => bodyForm({ title: changedTitle, source: "합성 언론", url: "https://route-audit.invalid/news", publishedAt: "2026-10-16" });
const noticeForm = () => bodyForm({ title: changedTitle, content: "합성 공지 본문", status: "PUBLISHED", pinned: "on" });
const facultyForm = () => bodyForm({ name: changedTitle, category: "CLASSICS", order: "2", currentPosition: "합성 현직" });
const storyForm = () => bodyForm({ name: changedTitle, quote: "합성 대표 문구", content: "합성 이야기 본문", requestId });
const cohortForm = () => bodyForm({ name: changedTitle, startDate: "2026-10-16", endDate: "2026-12-16", isActive: "on", order: "2" });
const faqForm = () => bodyForm({ question: changedTitle, answer: "합성 답변" });
const galleryForm = () => bodyForm({ title: changedTitle, description: "합성 앨범 설명" });
const templateForm = () => bodyForm({ slug: "route-audit-updated", title: changedTitle, category: "template", reportCategory: "classic-book", version: "2.0.0", body: "합성 양식 본문", published: "true", order: "2" });
const formForm = () => bodyForm({ title: changedTitle, description: "합성 양식 설명", cohortId: "none", isPublished: "true" });
const submissionForm = () => bodyForm({ formId: id, applicantName: "합성 신규 지원자",
  applicantEmail: "new-applicant@route-audit.invalid", applicantPhone: "000-0000-0000",
  [`q-${child}`]: "합성 지원 답변" });
const logForm = () => bodyForm({ title: changedTitle, content: "합성 수업일지 본문", classDate: "2026-10-16", cohortId: otherCohort, requestId });
const weeklyForm = () => bodyForm({ title: changedTitle, body: "합성 주차별 본문", classDate: "2026-10-16", cohortId: otherCohort, textType: "고전명작", requestId });
const materialForm = () => bodyForm({ title: changedTitle, audience: "STUDENT", weekNumber: "2", lectureTitle: "합성 강의", classDate: "2026-10-16" });
const resourceUrl = (kind: string) => `${blobOrigin}/resource-uploads/${kind}/${actor}/${requestId}/qa.pdf`;
const uploadedForm = (kind: string) => {
  const form = kind === "class-materials" ? materialForm() : bodyForm({ title: changedTitle });
  form.set("uploadedFileUrl", resourceUrl(kind));
  form.set("uploadedFileName", "qa.pdf");
  return form;
};
const scheduleForm = () => bodyForm({ title: changedTitle, eventDate: "2026-10-16", startTime: "13:00", endTime: "14:00", eventType: "CLASS", cohortId: cohort, weekNumber: "2", isPublic: "true", sessionsJson: JSON.stringify([{ category: "CLASSICS", content: "합성 수업", order: 0 }]) });

type Role = "ADMIN" | "FACULTY" | "MEMBER" | "PENDING";
type Outcome = { kind: "returned"; value: unknown } | { kind: "redirect"; path: string } | { kind: "thrown"; code?: string };
type Check = readonly [string, string];
type ActionCase = {
  module: string; name: string;
  run: (invalid: boolean) => Promise<unknown>;
  check?: Check; kind?: "redirect" | "returned"; voidResult?: boolean;
  allowed?: Role[]; role?: Role; public?: boolean;
  existing?: string[];
};

/** 유효 입력·잘못된 입력·실제 DB 변경을 함수별로 함께 기록합니다. */
const action = (module: string, name: string, run: ActionCase["run"], check?: Check, rest: Partial<ActionCase> = {}): ActionCase => ({ module, name, run, check, ...rest });
const selectCount = (table: string, where = "true", count = "0"): Check => [`SELECT count(*) FROM ${table} WHERE ${where}`, count];
const updated = (table: string, column = "title"): Check => [`SELECT ${column} FROM ${table} WHERE id='${id}'`, changedTitle];
const created = (table: string, column = "title"): Check => selectCount(table, `${column}='${changedTitle}'`, "1");
const redirect = { kind: "redirect" as const };
const noForm = () => new FormData();
const chooseForm = (invalid: boolean, form: () => FormData) => invalid ? noForm() : form();
const chooseId = (invalid: boolean, target = id) => invalid ? invalidId : target;

/**
 * 명명 규칙의 64개와 별도 2개를 모두 등록합니다.
 * db.batch는 별도 전송기로 동일 연결·동일 트랜잭션에서 실행합니다.
 */
const cases: ActionCase[] = [
  action("alumni", "createAlumniStory", bad => alumni.createAlumniStory(chooseForm(bad, storyForm)), created("alumni_stories", "name"), { ...redirect, existing: ["alumni-summary-postgres.test.ts", "alumni-direct-upload.test.ts"] }),
  action("alumni", "updateAlumniStory", bad => alumni.updateAlumniStory(chooseId(bad), storyForm()), updated("alumni_stories", "name"), redirect),
  action("alumni", "toggleAlumniPin", bad => alumni.toggleAlumniPin(chooseId(bad)), [`SELECT pinned FROM alumni_stories WHERE id='${id}'`, "t"]),
  action("alumni", "reorderAlumniStories", bad => alumni.reorderAlumniStories(bad ? [invalidId] : [id]), [`SELECT "order" FROM alumni_stories WHERE id='${id}'`, "1"], { existing: ["reorder-postgres.test.ts", "route-audit-admin-postgres.test.ts"] }),
  action("alumni", "deleteAlumniStory", bad => alumni.deleteAlumniStory(chooseId(bad)), selectCount("alumni_stories"), { voidResult: true }),
  action("applications/forms", "createForm", bad => forms.createForm(chooseForm(bad, formForm)), created("application_forms")),
  action("applications/forms", "updateForm", bad => forms.updateForm(chooseId(bad), formForm()), updated("application_forms")),
  action("applications/forms", "toggleFormPublishStatus", bad => forms.toggleFormPublishStatus(chooseId(bad), false), [`SELECT is_published FROM application_forms WHERE id='${id}'`, "f"]),
  action("applications/forms", "deleteForm", bad => forms.deleteForm(chooseId(bad, child)), selectCount("application_forms", `id='${child}'`), { existing: ["protect-submissions-postgres.test.ts", "protect-submissions-actions.test.ts"] }),
  action("applications/questions", "saveFormQuestions", bad => questions.saveFormQuestions(chooseId(bad), [{ title: changedTitle, type: "SHORT_ANSWER", isRequired: false, order: 0 }], 0), [`SELECT questions_revision FROM application_forms WHERE id='${id}'`, "1"], { existing: ["application-question-save-postgres.test.ts"] }),
  action("applications/submissions", "submitApplicationForm", bad => submissions.submitApplicationForm(emptyState, bad ? noForm() : submissionForm()), selectCount("application_submissions", "applicant_email='new-applicant@route-audit.invalid'", "1"), { public: true, existing: ["application-submission-postgres.test.ts", "application-submission-atomicity.test.ts", "rate-limit-postgres.test.ts"] }),
  action("applications/submissions", "deleteApplicationSubmission", bad => submissions.deleteApplicationSubmission(chooseId(bad)), selectCount("application_submissions"), { existing: ["p1-postgres.test.ts"] }),
  action("applications/submissions", "updateSubmissionStatus", bad => submissions.updateSubmissionStatus(chooseId(bad), "ACCEPTED"), [`SELECT status FROM application_submissions WHERE id='${id}'`, "ACCEPTED"]),
  action("class-logs", "createClassLogAsMember", bad => logs.createClassLogAsMember(chooseForm(bad, logForm)), [`SELECT cohort_id FROM class_logs WHERE id='${requestId}'`, cohort], { role: "MEMBER", allowed: ["ADMIN", "FACULTY", "MEMBER"] }),
  action("class-logs", "createClassLog", bad => logs.createClassLog(chooseForm(bad, logForm)), created("class_logs")),
  action("class-logs", "updateClassLog", bad => logs.updateClassLog(chooseId(bad), logForm()), updated("class_logs")),
  action("class-logs", "deleteClassLog", bad => logs.deleteClassLog(chooseId(bad)), selectCount("class_logs")),
  action("class-materials", "createClassMaterial", bad => materials.createClassMaterial(chooseForm(bad, () => uploadedForm("class-materials"))), created("class_materials"), { allowed: ["ADMIN", "FACULTY"], existing: ["resource-upload-reference.test.ts", "resource-upload-token.test.ts"] }),
  action("class-materials", "updateClassMaterial", bad => materials.updateClassMaterial(chooseId(bad), materialForm()), updated("class_materials"), { existing: ["class-material-date-preservation.test.ts"] }),
  action("class-materials", "deleteClassMaterial", bad => materials.deleteClassMaterial(chooseId(bad)), selectCount("class_materials")),
  action("faculty", "createFaculty", bad => faculty.createFaculty(chooseForm(bad, facultyForm)), created("faculty", "name"), { ...redirect, existing: ["faculty-direct-upload.test.ts"] }),
  action("faculty", "updateFaculty", bad => faculty.updateFaculty(chooseId(bad), facultyForm()), updated("faculty", "name"), redirect),
  action("faculty", "deleteFaculty", bad => faculty.deleteFaculty(chooseId(bad)), selectCount("faculty"), { voidResult: true }),
  action("faq", "updateFaqContact", bad => faq.updateFaqContact(chooseForm(bad, () => bodyForm({ contactName: changedTitle, contactPhone: "000-0000-0000", contactRole: "합성 담당" }))), [`SELECT contact_name FROM faq_contact LIMIT 1`, changedTitle]),
  action("faq", "createFaqItem", bad => faq.createFaqItem(chooseForm(bad, faqForm)), created("faq_items", "question"), redirect),
  action("faq", "updateFaqItem", bad => faq.updateFaqItem(chooseId(bad), faqForm()), updated("faq_items", "question"), redirect),
  action("faq", "deleteFaqItem", bad => faq.deleteFaqItem(chooseId(bad)), selectCount("faq_items"), { voidResult: true }),
  action("faq", "reorderFaqItems", bad => faq.reorderFaqItems(bad ? [invalidId] : [id]), [`SELECT "order" FROM faq_items WHERE id='${id}'`, "1"]),
  action("gallery", "createGallery", bad => gallery.createGallery(chooseForm(bad, galleryForm)), created("galleries"), redirect),
  action("gallery", "updateGallery", bad => gallery.updateGallery(chooseId(bad), galleryForm()), updated("galleries")),
  action("gallery", "deleteGallery", bad => gallery.deleteGallery(chooseId(bad)), selectCount("galleries")),
  action("gallery", "reorderGalleryImages", bad => gallery.reorderGalleryImages(chooseId(bad), [otherChild, child]), [`SELECT "order" FROM gallery_images WHERE id='${otherChild}'`, "0"]),
  action("gallery", "deleteGalleryImage", bad => gallery.deleteGalleryImage(chooseId(bad), child), selectCount("gallery_images", `id='${child}'`)),
  action("guidebooks", "createGuidebook", bad => guidebooks.createGuidebook(chooseForm(bad, () => uploadedForm("guidebooks"))), created("guidebooks"), { existing: ["guidebook-duplicate-upload.test.ts", "resource-upload-reference.test.ts"] }),
  action("guidebooks", "updateGuidebook", bad => guidebooks.updateGuidebook(chooseId(bad), bodyForm({ title: changedTitle })), updated("guidebooks")),
  action("guidebooks", "deleteGuidebook", bad => guidebooks.deleteGuidebook(chooseId(bad)), selectCount("guidebooks")),
  action("notices", "createNotice", bad => notices.createNotice(chooseForm(bad, noticeForm)), created("notices"), redirect),
  action("notices", "updateNotice", bad => notices.updateNotice(chooseId(bad), noticeForm()), updated("notices"), redirect),
  action("notices", "deleteNotice", bad => notices.deleteNotice(chooseId(bad)), selectCount("notices")),
  action("notices", "togglePin", bad => notices.togglePin(chooseId(bad)), [`SELECT pinned FROM notices WHERE id='${id}'`, "t"]),
  action("notices", "toggleStatus", bad => notices.toggleStatus(chooseId(bad)), [`SELECT status FROM notices WHERE id='${id}'`, "PUBLISHED"]),
  action("press", "createPressArticle", bad => press.createPressArticle(chooseForm(bad, articleForm)), created("press_articles"), redirect),
  action("press", "updatePressArticle", bad => press.updatePressArticle(chooseId(bad), articleForm()), updated("press_articles"), redirect),
  action("press", "deletePressArticle", bad => press.deletePressArticle(chooseId(bad)), selectCount("press_articles"), { voidResult: true, existing: ["press-blob-ownership.test.ts"] }),
  action("press", "reorderPressArticles", bad => press.reorderPressArticles(bad ? [invalidId] : [id]), [`SELECT "order" FROM press_articles WHERE id='${id}'`, "1"]),
  action("recruitment", "createCohort", bad => recruitment.createCohort(chooseForm(bad, cohortForm)), created("cohorts", "name"), redirect),
  action("recruitment", "updateCohort", bad => recruitment.updateCohort(chooseId(bad, cohort), cohortForm()), [`SELECT name FROM cohorts WHERE id='${cohort}'`, changedTitle], redirect),
  action("recruitment", "deleteCohort", bad => recruitment.deleteCohort(chooseId(bad, otherCohort)), selectCount("cohorts", `id='${otherCohort}'`), { existing: ["protect-submissions-postgres.test.ts", "recruitment-delete-feedback.test.ts"] }),
  action("recruitment-settings", "updateRecruitmentSettings", bad => settings.updateRecruitmentSettings(bad ? noForm() : bodyForm({ posterInputMode: "url", posterImageUrl: `${blobOrigin}/qa/poster.jpg`, activeCohortId: cohort, detailsMarkdown: changedTitle, posterLayout: "left" })), [`SELECT details_markdown FROM recruitment_settings`, changedTitle], { existing: ["recruitment-singleton-postgres.test.ts", "recruitment-poster-ownership.test.ts"] }),
  action("recruitment-settings", "updateRecruitmentInfo", bad => settings.updateRecruitmentInfo(bodyForm(bad ? { googleFormUrl: "http://route-audit.invalid" } : { activeCohortId: cohort, googleFormUrl: "https://route-audit.invalid/apply", recruitmentStartDate: "2026-10-16", deadlineDate: "2026-10-30" })), [`SELECT google_form_url FROM recruitment_settings`, "https://route-audit.invalid/apply"]),
  action("recruitment-settings", "updateRecruitmentPoster", bad => settings.updateRecruitmentPoster(bodyForm(bad ? { posterInputMode: "잘못됨" } : { posterInputMode: "url", posterImageUrl: `${blobOrigin}/qa/poster.jpg`, posterLayout: "left" })), [`SELECT poster_layout FROM recruitment_settings`, "left"]),
  action("recruitment-settings", "updateRecruitmentDetails", bad => settings.updateRecruitmentDetails(bodyForm({ detailsMarkdown: bad ? "가".repeat(20_001) : changedTitle })), [`SELECT details_markdown FROM recruitment_settings`, changedTitle]),
  action("report-templates", "createReportTemplate", bad => templates.createReportTemplate(chooseForm(bad, templateForm)), created("report_templates"), redirect),
  action("report-templates", "updateReportTemplate", bad => templates.updateReportTemplate(chooseId(bad), templateForm()), updated("report_templates"), redirect),
  action("report-templates", "deleteReportTemplate", bad => templates.deleteReportTemplate(chooseId(bad)), [`SELECT published FROM report_templates WHERE id='${id}'`, "f"]),
  action("schedule", "createScheduleEvent", bad => schedule.createScheduleEvent(emptyState, chooseForm(bad, scheduleForm)), created("schedule_events"), { ...redirect, existing: ["schedule-session-preservation-postgres.test.ts"] }),
  action("schedule", "updateScheduleEvent", bad => schedule.updateScheduleEvent(chooseId(bad), emptyState, scheduleForm()), updated("schedule_events"), redirect),
  action("schedule", "deleteScheduleEvent", bad => schedule.deleteScheduleEvent(chooseId(bad)), selectCount("schedule_events")),
  action("users", "updateUserGroup", bad => users.updateUserGroup(chooseId(bad, member), "FACULTY"), [`SELECT role,coalesce(cohort_id::text,'없음'),session_version FROM users WHERE id='${member}'`, "FACULTY|없음|1"], { existing: ["users-group-postgres.test.ts"] }),
  action("users", "deleteUser", bad => users.deleteUser(chooseId(bad, member)), selectCount("users", `id='${member}'`), { existing: ["users-group-postgres.test.ts", "route-audit-admin-postgres.test.ts"] }),
  action("weekly-texts", "createWeeklyText", bad => weekly.createWeeklyText(chooseForm(bad, weeklyForm)), created("weekly_texts"), { existing: ["create-with-blobs.test.ts", "post-create-atomicity.test.ts", "weekly-text-image-upload.test.ts"] }),
  action("weekly-texts", "createWeeklyTextAsMember", bad => weekly.createWeeklyTextAsMember(chooseForm(bad, weeklyForm)), [`SELECT cohort_id FROM weekly_texts WHERE id='${requestId}'`, cohort], { role: "MEMBER", allowed: ["ADMIN", "FACULTY", "MEMBER"] }),
  action("weekly-texts", "updateWeeklyText", bad => weekly.updateWeeklyText(chooseId(bad), weeklyForm()), updated("weekly_texts")),
  action("weekly-texts", "deleteWeeklyText", bad => weekly.deleteWeeklyText(chooseId(bad)), selectCount("weekly_texts")),
  // 접두사 기준 64개 밖의 실제 쓰기 두 개도 누락하지 않습니다.
  action("gallery", "addGalleryImages", bad => gallery.addGalleryImages(id, bodyForm({ uploadedImageUrls: bad ? "[]" : JSON.stringify([`${blobOrigin}/gallery-uploads/${id}/${actor}/${requestId}.png`]), alt: "합성 사진" })), selectCount("gallery_images", "true", "3"), { existing: ["gallery-direct-upload.test.ts", "gallery-upload-refresh.test.ts"] }),
  action("press", "trackPressView", bad => press.trackPressView(chooseId(bad)), [`SELECT view_count FROM press_articles WHERE id='${id}'`, "1"], { public: true, voidResult: true }),
];

/** 오류 원문에는 SQL과 값이 포함될 수 있어 종류·고정 경로·SQLSTATE만 반환합니다. */
async function observe(run: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { kind: "returned", value: await run() };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:/")) {
      return { kind: "redirect", path: error.message.slice(9) };
    }
    let current = error;
    const seen = new Set<object>();
    while (typeof current === "object" && current !== null && !seen.has(current)) {
      seen.add(current);
      if ("code" in current && typeof current.code === "string") return { kind: "thrown", code: current.code };
      current = "cause" in current ? current.cause : undefined;
    }
    return { kind: "thrown" };
  }
}

describe("관리자 전체 쓰기: 실제 PostgreSQL CRUD와 거부 경로", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let batchTransport: ReturnType<typeof createPsqlBatchTransport>;
  let tables: string[];
  const sqlResults: Array<{ rowCount?: number; code?: string; constraint?: string }> = [];
  const batchSizes: number[] = [];
  const oldFetch = neonConfig.fetchFunction;
  const oldEndpoint = neonConfig.fetchEndpoint;
  const savedEnvironment = new Map<string, string | undefined>();
  const domainTables = ["users", "cohorts", "alumni_stories", "alumni_story_images", "application_forms", "application_questions", "application_question_options", "application_answers", "application_submissions", "application_submissions_log", "rate_limit_events", "class_logs", "class_log_images", "class_materials", "faculty", "faq_contact", "faq_items", "galleries", "gallery_images", "guidebooks", "notices", "press_articles", "recruitment_settings", "report_templates", "schedule_events", "schedule_sessions", "weekly_texts", "weekly_text_images", "markdown_image_assets"];

  beforeAll(() => {
    const bin = process.env.HRA_TEST_PG_BIN;
    if (!bin) throw new Error("쓰기 감사에는 HRA_TEST_PG_BIN 지정이 필요합니다.");
    cluster = createQaPostgres(bin);
    cluster.sql(exportQaSchemaSql());
    for (const file of ["migrate-protect-application-answers.sql", "migrate-protect-application-submissions.sql", "migrate-atomic-application-questions.sql", "migrate-assert-application-question-revision.sql", "sql/rate-limit-reservations.sql"]) {
      cluster.sql(readFileSync(`scripts/${file}`, "utf8"));
    }
    cluster.sql(`CREATE TABLE route_audit_batch_probe(id integer PRIMARY KEY,
      value text NOT NULL CONSTRAINT route_audit_batch_value_check CHECK(value <> '금지'));
      CREATE FUNCTION route_audit_fail_submission_delete() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'route_audit_delete_denied' USING ERRCODE='P0001'; END; $$;`);
    tables = cluster.sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename").split("\n");
    const transport = createPsqlTransport(cluster.environment);
    batchTransport = createPsqlBatchTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" || new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 전송 차단");
      }
      const payload = JSON.parse(String(options.body));
      try {
        if (payload.queries) {
          batchSizes.push(payload.queries.length);
          const result = await batchTransport(payload, options.headers);
          sqlResults.push(...result.results.map((item: { rowCount: number }) => ({ rowCount: item.rowCount })));
          return Response.json(result);
        }
        const result = await transport(payload);
        sqlResults.push({ rowCount: result.rowCount });
        return Response.json(result);
      } catch (error) {
        const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "QA_TRANSPORT_ERROR";
        const constraint = error instanceof Error && "constraint" in error && typeof error.constraint === "string" ? error.constraint : undefined;
        const message = error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message) ? error.message : "격리 쿼리 실행 거부";
        sqlResults.push({ code, constraint });
        return Response.json({ message, code, constraint }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
    // 운영 자격증명을 읽지 않고 저장소 설정도 가짜 공개 호스트로 고정합니다.
    for (const [name, value] of Object.entries({ RESOURCE_PRIVATE_BLOB_ENABLED: "false", BLOB_READ_WRITE_TOKEN: "" })) {
      savedEnvironment.set(name, process.env[name]);
      process.env[name] = value;
    }
    vi.stubGlobal("fetch", async (input: unknown) => {
      const url = new URL(String(input));
      if (url.origin !== blobOrigin) throw new Error("쓰기 감사 외부 네트워크 차단");
      const bytes = url.pathname.endsWith(".png")
        ? Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
        : new TextEncoder().encode("%PDF-1.7\nQA");
      return new Response(bytes);
    });
    mocks.put.mockImplementation(async () => { throw new Error("이번 감사에서 구형 Blob 업로드는 실행하지 않습니다."); });
    mocks.del.mockImplementation(async (value: string) => {
      if (new URL(value).origin !== blobOrigin) throw new Error("합성 URL 이외 삭제 차단");
    });
    mocks.head.mockImplementation(async (value: string) => {
      const url = new URL(value);
      if (url.origin !== blobOrigin) throw new Error("합성 URL 이외 조회 차단");
      return { url: value, pathname: url.pathname.slice(1), size: 12,
        contentType: url.pathname.endsWith(".png") ? "image/png" : "application/pdf" };
    });
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    sqlResults.length = 0;
    batchSizes.length = 0;
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    // 각 액션은 독립된 초기 자료에서 실행하며 다른 작업자의 격리 DB에 접근하지 않습니다.
    cluster.sql(`TRUNCATE ${tables.map(table => `"${table}"`).join(",")} CASCADE;
      INSERT INTO cohorts(id,name,recruitment_status) VALUES('${cohort}','합성 88기','OPEN'),('${otherCohort}','합성 89기','CLOSED');
      INSERT INTO users(id,name,email,role,cohort_id) VALUES
        ('${actor}','합성 관리자','admin@route-audit.invalid','ADMIN',null),
        ('${member}','합성 회원','member@route-audit.invalid','MEMBER','${cohort}');
      INSERT INTO alumni_stories(id,name,quote,content) VALUES('${id}','합성 수료생','합성 문구','합성 이야기');
      INSERT INTO faculty(id,name,category) VALUES('${id}','합성 교수','CLASSICS');
      INSERT INTO schedule_events(id,title,event_date,event_type,cohort_id) VALUES('${id}','합성 일정',now(),'CLASS','${cohort}');
      INSERT INTO schedule_sessions(id,schedule_event_id,category,content) VALUES('${child}','${id}','CLASSICS','합성 수업');
      INSERT INTO notices(id,title,content,author_id) VALUES('${id}','합성 공지','합성 본문','${actor}');
      INSERT INTO press_articles(id,title,source,url,published_at) VALUES('${id}','합성 기사','합성 언론','https://route-audit.invalid/article',now());
      INSERT INTO faq_items(id,question,answer) VALUES('${id}','합성 질문','합성 답변');
      INSERT INTO faq_contact(id,cohort_name,contact_name,contact_phone,is_active) VALUES('${id}','합성 88기','합성 담당자','000-0000-0000',true);
      INSERT INTO galleries(id,title) VALUES('${id}','합성 앨범');
      INSERT INTO gallery_images(id,gallery_id,url,"order") VALUES
        ('${child}','${id}','${blobOrigin}/qa/a.png',0),('${otherChild}','${id}','${blobOrigin}/qa/b.png',1);
      INSERT INTO class_logs(id,title,content,class_date,cohort_id,author_id) VALUES('${id}','합성 일지','합성 본문',now(),'${cohort}','${actor}');
      INSERT INTO weekly_texts(id,title,body,cohort_id) VALUES('${id}','합성 텍스트','합성 본문','${cohort}');
      INSERT INTO class_materials(id,title,file_url,file_name) VALUES('${id}','합성 강의자료','${blobOrigin}/qa/material.pdf','qa.pdf');
      INSERT INTO guidebooks(id,title,file_url,file_name) VALUES('${id}','합성 가이드','${blobOrigin}/qa/guide.pdf','qa.pdf');
      INSERT INTO report_templates(id,slug,title,category,report_category,body,published) VALUES('${id}','route-audit-template','합성 양식','template','classic-book','합성 본문',true);
      INSERT INTO application_forms(id,title,cohort_id,is_published) VALUES('${id}','합성 지원서','${cohort}',true),('${child}','합성 빈 지원서',null,false);
      INSERT INTO application_questions(id,form_id,title,type,is_required) VALUES('${child}','${id}','합성 지원 동기','LONG_ANSWER',true);
      INSERT INTO application_submissions(id,form_id,applicant_name,applicant_email) VALUES('${id}','${id}','합성 지원자','applicant@route-audit.invalid');
      INSERT INTO recruitment_settings(singleton_key,active_cohort_id) VALUES(1,'${cohort}');
    `);
  });

  afterAll(() => {
    neonConfig.fetchFunction = oldFetch;
    neonConfig.fetchEndpoint = oldEndpoint;
    mocks.database = undefined;
    for (const [name, value] of savedEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    cluster?.close();
  });

  /** 거부 응답과 별도로 모든 쓰기 대상 테이블의 전체 행 내용을 비교합니다. */
  const snapshot = () => cluster.sql(`SELECT md5(coalesce(string_agg(x,E'\n' ORDER BY x),'')) FROM (
    ${domainTables.map(table => `SELECT '${table}' || row_to_json(t)::text AS x FROM ${table} t`).join(" UNION ALL ")}
  ) state`);

  /** 지원서 삭제에서 답변·과거 로그·예약까지 실제 정리하는지 확인할 합성 종속 행입니다. */
  const seedSubmissionDependents = () => cluster.sql(`
    INSERT INTO application_answers(submission_id,question_id,value) VALUES('${id}','${child}','합성 기존 답변');
    INSERT INTO application_submissions_log(email) VALUES('applicant@route-audit.invalid');
    INSERT INTO rate_limit_events(reservation_id,scope,key_hash,submission_id)
      VALUES('${requestId}','submission-email-day','${"0".repeat(64)}','${id}');
  `);

  for (const item of cases) {
    it(`${item.module}/${item.name}: 정상 입력의 결과와 실제 저장 내용을 확인합니다`, async () => {
      if (item.role) mocks.auth.mockResolvedValue({ user: { id: member, role: item.role } });
      if (item.name === "deleteApplicationSubmission") seedSubmissionDependents();
      vi.spyOn(console, "info").mockImplementation(() => undefined);
      const result = await observe(() => item.run(false));
      expect(sqlResults.filter(result => result.code), "실제 SQLSTATE 오류가 없어야 합니다").toEqual([]);
      if (item.kind === "redirect") expect(result).toMatchObject({ kind: "redirect" });
      else if (item.voidResult) expect(result).toEqual({ kind: "returned", value: undefined });
      else expect(result).toMatchObject({ kind: "returned", value: { success: true } });
      expect(sqlResults.length).toBeGreaterThan(0);
      if (!item.check) throw new Error("정상 CRUD 검사에 DB 결과 검증이 누락되었습니다.");
      expect(cluster.sql(item.check[0])).toBe(item.check[1]);
      if (item.name === "submitApplicationForm") {
        expect(batchSizes).toEqual([4]);
        expect(cluster.sql("SELECT count(*) FROM application_submissions")).toBe("2");
        expect(cluster.sql("SELECT value FROM application_answers")).toBe("합성 지원 답변");
        expect(cluster.sql("SELECT count(*) FROM rate_limit_events WHERE submission_id IS NOT NULL")).toBe("3");
        expect(cluster.sql("SELECT count(*) FROM rate_limit_events WHERE submission_id IS NULL")).toBe("0");
      }
      if (item.name === "deleteApplicationSubmission") {
        expect(batchSizes).toEqual([2]);
        expect(cluster.sql("SELECT (SELECT count(*) FROM application_answers),(SELECT count(*) FROM application_submissions_log),(SELECT count(*) FROM rate_limit_events)")).toBe("0|0|0");
      }
      expect(mocks.put).not.toHaveBeenCalled();
    });
  }

  for (const item of cases) {
    it(`${item.module}/${item.name}: 잘못된 입력은 DB를 변경하지 않습니다`, async () => {
      const before = snapshot();
      const result = await observe(() => item.run(true));
      if (item.voidResult) expect(result).toEqual({ kind: "returned", value: undefined });
      else expect(result).toMatchObject({ kind: "returned", value: { success: false } });
      expect(snapshot()).toBe(before);
      expect(sqlResults.filter(result => result.code)).toEqual([]);
      expect(mocks.put).not.toHaveBeenCalled();
      expect(mocks.del).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
  }

  for (const item of cases.filter(item => !item.public)) {
    for (const role of [null, "PENDING", "MEMBER", "FACULTY"] as const) {
      if (role && (item.allowed ?? ["ADMIN"]).includes(role)) continue;
      it(`${item.module}/${item.name}: ${role ?? "비로그인"} 요청을 실제 DB 접근 전에 거부합니다`, async () => {
        // 업로드 URL의 소유자와 같은 합성 계정을 사용하여 소유권 오류가 인가 누락을 가리지 않습니다.
        if (role) cluster.sql(`UPDATE users SET role='${role}' WHERE id='${actor}'`);
        mocks.auth.mockResolvedValue(role ? { user: { id: actor, role } } : null);
        const before = snapshot();
        const result = await observe(() => item.run(false));
        if (item.allowed) expect(result).toMatchObject({ kind: "returned", value: { success: false } });
        else expect(result).toEqual({ kind: "redirect", path: "/login" });
        expect(sqlResults).toEqual([]);
        expect(snapshot()).toBe(before);
        expect(mocks.put).not.toHaveBeenCalled();
        expect(mocks.head).not.toHaveBeenCalled();
        expect(mocks.del).not.toHaveBeenCalled();
        expect(mocks.revalidatePath).not.toHaveBeenCalled();
      });
    }
  }

  // 일반 CRUD에서 쓰지 않은 허용 역할도 실제 저장까지 확인해 거부 검사와 대칭을 맞춥니다.
  for (const item of cases.filter(item => item.allowed)) {
    for (const role of (item.allowed ?? []).filter(role => role !== (item.role ?? "ADMIN"))) {
      it(`${item.module}/${item.name}: 추가 허용 역할 ${role}의 유효 요청을 실제 저장합니다`, async () => {
        cluster.sql(`UPDATE users SET role='${role}' WHERE id='${actor}'`);
        mocks.auth.mockResolvedValue({ user: { id: actor, role } });
        expect(await observe(() => item.run(false))).toMatchObject({ kind: "returned", value: { success: true } });
        expect(sqlResults.filter(result => result.code)).toEqual([]);
        if (item.name === "createClassMaterial") {
          expect(cluster.sql(`SELECT uploaded_by_id FROM class_materials WHERE title='${changedTitle}'`)).toBe(actor);
          expect(cluster.sql(`SELECT count(*) FROM markdown_image_assets WHERE uploaded_by_id='${actor}'`)).toBe("1");
          expect(mocks.head).toHaveBeenCalledTimes(1);
        } else {
          const table = item.name === "createClassLogAsMember" ? "class_logs" : "weekly_texts";
          // 관리자와 교수진에게는 MEMBER 본인 기수 강제 규칙이 적용되지 않습니다.
          expect(cluster.sql(`SELECT cohort_id FROM ${table} WHERE id='${requestId}'`)).toBe(otherCohort);
          expect(cluster.sql(`SELECT title FROM ${table} WHERE id='${requestId}'`)).toBe(changedTitle);
        }
      });
    }
  }

  it("없는 기수 수정은 저장·이동 없이 실패 결과를 반환합니다 (#130 관련)", async () => {
    const before = snapshot();
    const missing = "90000000-0000-4000-8000-000000000099";
    expect(await observe(() => recruitment.updateCohort(missing, cohortForm())))
      .toEqual({ kind: "returned", value: { success: false, message: "기수를 찾을 수 없습니다." } });
    expect(sqlResults).toEqual([{ rowCount: 0 }]);
    expect(snapshot()).toBe(before);
    expect(cluster.sql("SELECT count(*) FROM cohorts")).toBe("2");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("실제 Neon 배치 두 쿼리는 같은 연결·트랜잭션을 사용하고 앞선 쓰기를 읽습니다", async () => {
    const client = neon(qaDatabaseUrl, { arrayMode: true, fullResults: true });
    const result = await client.transaction([
      client.query("INSERT INTO route_audit_batch_probe(id,value) VALUES($1,$2) RETURNING id,pg_backend_pid() AS pid,pg_current_xact_id()::text AS transaction_id", [1, "합성 배치"]),
      client.query("SELECT count(*)::integer AS count,pg_backend_pid() AS pid,pg_current_xact_id()::text AS transaction_id FROM route_audit_batch_probe"),
    ]);
    expect(batchSizes).toEqual([2]);
    expect(result.map(item => item.rowCount)).toEqual([1, 1]);
    expect(result[0].rows[0][0]).toBe(1);
    expect(result[1].rows[0][0]).toBe(1);
    expect(result[0].rows[0].slice(1)).toEqual(result[1].rows[0].slice(1));
    expect(cluster.sql("SELECT count(*) FROM route_audit_batch_probe")).toBe("1");
  });

  it("배치 결과는 인용·역슬래시·NULL·참거짓·정수·중복 컬럼과 DELETE 행 수를 보존합니다", async () => {
    cluster.sql("INSERT INTO route_audit_batch_probe VALUES(1,'합성 배치')");
    const client = neon(qaDatabaseUrl, { arrayMode: true, fullResults: true });
    const value = "합성 '인용' \\ 역슬래시\n다음 행";
    const result = await client.transaction([
      client.query("SELECT $1::text AS duplicate,$2::text AS duplicate,$3::boolean AS flag,$4::integer AS number", [value, null, true, 42]),
      client.query("DELETE FROM route_audit_batch_probe WHERE id=$1", [1]),
    ]);
    expect(result[0].fields.map(field => field.name)).toEqual(["duplicate", "duplicate", "flag", "number"]);
    expect(result[0].fields.map(field => field.dataTypeID)).toEqual([25, 25, 16, 23]);
    expect(result[0].rows).toEqual([[value, null, true, 42]]);
    expect(result[1]).toMatchObject({ command: "DELETE", rowCount: 1, rows: [] });
    expect(cluster.sql("SELECT count(*) FROM route_audit_batch_probe")).toBe("0");
  });

  it("타입 OID 전송 실패는 실제 배치 쓰기를 시작하기 전에 종료됩니다", async () => {
    const bin = join(cluster.root, "metadata-fault-bin");
    const counter = join(bin, "calls");
    mkdirSync(bin, { mode: 0o700 });
    // 첫 Describe는 실제 psql에 전달하고 두 번째 OID 전송만 끊습니다. 정상 응답을 만들지 않습니다.
    // 이 파일과 호출 횟수는 격리 클러스터 아래에만 존재하며 close에서 함께 정리됩니다.
    writeFileSync(join(bin, "psql"), `#!${process.execPath}\n` + `
      const { readFileSync, writeFileSync, existsSync } = require('node:fs');
      const { spawnSync } = require('node:child_process');
      const path = ${JSON.stringify(counter)};
      const count = existsSync(path) ? Number(readFileSync(path, 'utf8')) + 1 : 1;
      writeFileSync(path, String(count), { mode: 0o600 });
      const input = readFileSync(0, 'utf8');
      if (count === 2) {
        process.stderr.write('ERROR: 08006: route_audit_metadata_transport_fault\\n');
        process.exit(1);
      }
      const result = spawnSync(${JSON.stringify(join(cluster.environment.HRA_TEST_PG_BIN, "psql"))}, process.argv.slice(2),
        { input, env: process.env, encoding: 'utf8' });
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      process.exit(result.status === 0 && !result.error ? 0 : 1);
    `, { mode: 0o700 });
    const faulted = createPsqlBatchTransport({ ...cluster.environment, HRA_TEST_PG_BIN: bin });
    await expect(faulted({ queries: [
      { query: "INSERT INTO route_audit_batch_probe VALUES(1,'합성 타입 조회') RETURNING id", params: [] },
      { query: "SELECT id FROM route_audit_batch_probe", params: [] },
    ] }, undefined)).rejects.toMatchObject({ code: "08006" });
    expect(readFileSync(counter, "utf8")).toBe("2");
    expect(cluster.sql("SELECT count(*) FROM route_audit_batch_probe")).toBe("0");
  });

  it("두 번째 쿼리의 실제 CHECK 위반은 첫 번째 쓰기까지 전체 롤백합니다", async () => {
    const client = neon(qaDatabaseUrl);
    await expect(client.transaction([
      client.query("INSERT INTO route_audit_batch_probe VALUES($1,$2)", [1, "정상"]),
      client.query("INSERT INTO route_audit_batch_probe VALUES($1,$2)", [2, "금지"]),
    ])).rejects.toMatchObject({ code: "23514", constraint: "route_audit_batch_value_check" });
    expect(batchSizes).toEqual([2]);
    expect(cluster.sql("SELECT count(*) FROM route_audit_batch_probe")).toBe("0");
    expect(cluster.sql("SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND state='idle in transaction'")).toBe("0");
  });

  it("실제 Neon SDK의 격리 수준·읽기 전용·지연 가능 헤더를 PostgreSQL에 적용합니다", async () => {
    const client = neon(qaDatabaseUrl);
    const result = await client.transaction([
      client.query("SELECT current_setting('transaction_isolation') AS isolation,current_setting('transaction_read_only') AS readonly,current_setting('transaction_deferrable') AS deferred"),
    ], { isolationLevel: "Serializable", readOnly: true, deferrable: true });
    expect(result).toEqual([[{ isolation: "serializable", readonly: "on", deferred: "on" }]]);
    await expect(client.transaction([
      client.query("INSERT INTO route_audit_batch_probe VALUES(1,'합성 읽기 전용')"),
    ], { readOnly: true })).rejects.toMatchObject({ code: "25006" });
    expect(cluster.sql("SELECT count(*) FROM route_audit_batch_probe")).toBe("0");
  });

  it("배치의 외부 DB·다른 소켓·표식 불일치·트랜잭션 종료 입력을 실행 전에 차단합니다", async () => {
    for (const override of [
      { DATABASE_URL: "postgresql://qa:qa@outside.invalid/qa" },
      { PGDATABASE: "postgres" }, { PGUSER: "다른사용자" }, { PGSSLMODE: "require" },
      { PGHOST: "/tmp/route-audit-nonexistent-socket" }, { PGPORT: "55488" },
    ]) expect(() => createPsqlBatchTransport({ ...cluster.environment, ...override })).toThrow();
    expect(() => createPsqlBatchTransport(cluster.environment, { timeoutMs: 15_001 })).toThrow();
    await expect(batchTransport({ queries: [{ query: "COMMIT", params: [] }] }, undefined)).rejects.toThrow("조회·쓰기");
    await expect(batchTransport({ queries: [{ query: "SELECT 1; DELETE FROM users", params: [] }] }, undefined)).rejects.toThrow("단일 SQL");
    expect(cluster.sql("SELECT count(*) FROM users")).toBe("2");
  });

  it("PGHOSTADDR·PGSERVICE·PGOPTIONS는 격리 소켓 연결을 덮어쓰지 못합니다", async () => {
    const guarded = createPsqlBatchTransport({ ...cluster.environment,
      PGHOSTADDR: "127.0.0.1", PGSERVICE: "route_audit_forbidden_service",
      PGOPTIONS: "-c application_name=route_audit_forbidden_option" });
    const result = await guarded({ queries: [{ query: "SELECT inet_server_addr() IS NULL AS socket,current_setting('application_name') AS name", params: [] }] }, undefined);
    expect(result.results[0].rows).toEqual([["t", "psql"]]);
  });

  it("제한 시간 종료도 열린 배치를 롤백하고 첫 INSERT의 잠금을 해제합니다", async () => {
    const bounded = createPsqlBatchTransport(cluster.environment, { timeoutMs: 300 });
    await expect(bounded({ queries: [
      { query: "INSERT INTO route_audit_batch_probe VALUES($1,$2)", params: [1, "합성 시간 제한"] },
      { query: "SELECT pg_sleep(2)", params: [] },
    ] }, undefined)).rejects.toMatchObject({ code: "QA_TRANSPORT_TIMEOUT" });
    expect(cluster.sql("SELECT count(*) FROM route_audit_batch_probe")).toBe("0");
    // 같은 키로 실제 재삽입하면 이전 트랜잭션이 잠금을 남기지 않았음도 확인할 수 있습니다.
    cluster.sql("SET lock_timeout='3s'; INSERT INTO route_audit_batch_probe VALUES(1,'합성 재시도')");
    expect(cluster.sql("SELECT count(*) FROM route_audit_batch_probe")).toBe("1");
  });

  it("답변 없는 공개 지원서도 실제 3문장 배치로 마스터와 예약을 함께 저장합니다", async () => {
    cluster.sql("DELETE FROM application_questions");
    expect(await submissions.submitApplicationForm(emptyState, submissionForm())).toMatchObject({ success: true });
    expect(batchSizes).toEqual([3]);
    expect(cluster.sql("SELECT (SELECT count(*) FROM application_submissions),(SELECT count(*) FROM application_answers),(SELECT count(*) FROM rate_limit_events WHERE submission_id IS NOT NULL)")).toBe("2|0|3");
  });

  it("실제 공개 지원서의 답변 CHECK 실패는 마스터·답변·예약 연결을 롤백합니다", async () => {
    cluster.sql("ALTER TABLE application_answers ADD CONSTRAINT route_audit_answer_check CHECK(value <> '합성 지원 답변')");
    try {
      expect(await submissions.submitApplicationForm(emptyState, submissionForm())).toEqual({ success: false,
        message: "제출 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." });
      expect(batchSizes).toEqual([4]);
      expect(sqlResults.filter(result => result.code)).toEqual([{ code: "23514", constraint: "route_audit_answer_check" }]);
      expect(cluster.sql("SELECT (SELECT count(*) FROM application_submissions),(SELECT count(*) FROM application_answers)")).toBe("1|0");
      // 예약은 배치 전 별도로 확정하는 정책이므로 실패 시에도 제한 축 3개를 유지하며 연결만 롤백합니다.
      expect(cluster.sql("SELECT count(*),count(submission_id) FROM rate_limit_events")).toBe("3|0");
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      cluster.sql("ALTER TABLE application_answers DROP CONSTRAINT route_audit_answer_check");
    }
  });

  it("실제 지원서 삭제의 두 번째 문장 실패는 먼저 삭제한 제한 로그와 종속 행을 보존합니다", async () => {
    seedSubmissionDependents();
    const before = snapshot();
    cluster.sql("CREATE TRIGGER route_audit_deny_submission_delete BEFORE DELETE ON application_submissions FOR EACH ROW EXECUTE FUNCTION route_audit_fail_submission_delete()");
    try {
      expect(await submissions.deleteApplicationSubmission(id)).toEqual({ success: false, message: "삭제 중 오류가 발생했습니다." });
      expect(batchSizes).toEqual([2]);
      expect(sqlResults.filter(result => result.code)).toEqual([{ code: "P0001", constraint: undefined }]);
      expect(snapshot()).toBe(before);
      expect(cluster.sql("SELECT (SELECT count(*) FROM application_submissions),(SELECT count(*) FROM application_answers),(SELECT count(*) FROM application_submissions_log),(SELECT count(*) FROM rate_limit_events)")).toBe("1|1|1|1");
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    } finally {
      cluster.sql("DROP TRIGGER route_audit_deny_submission_delete ON application_submissions");
    }
  });
});
