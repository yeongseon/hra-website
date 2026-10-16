// @vitest-environment node
/** 관리 화면의 실제 SQL을 격리 PostgreSQL에서 실행하여 대상 확인과 공개 트랜잭션의 일치를 검증한다. */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ require: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/academic-admin", () => ({ requireAcademicApprover: mocks.require, getAcademicApproverId: () => actor }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
import { getAssignmentAdmin, getAssignmentAdminAvailability, getAssignmentAdminList, getAssignmentFormOptions, getAssignmentCohorts, getAssignmentPublishPreview } from "@/features/academics/assignments/admin-queries";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const learner = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const otherCohort = "20000000-0000-4000-8000-000000000002";
const assignment = "70000000-0000-4000-8000-000000000001";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;

describe.skipIf(!bin)("과제 관리 실제 SQL", () => {
  let root: string; let started = false; let args: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), args, { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const mutate = (action: string, payload: unknown, request = randomUUID()) => run(`SELECT public.mutate_academic_assignment(
    '${action}','${actor}','${actor}','${request}','${request}',${quote(JSON.stringify(payload))}::jsonb);`);
  const counts = () => run("SELECT (SELECT count(*) FROM assignment_targets)||','||(SELECT count(*) FROM academic_assignment_events);");
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-assignment-admin-"));
    execFileSync(program("initdb"), ["-D", join(root,"data"),"-A","trust","-U","hra_test","--no-locale","-E","UTF8"], { stdio:"pipe" });
    execFileSync(program("pg_ctl"), ["-D",join(root,"data"),"-l",join(root,"server.log"),"-o",`-h '' -k ${root} -p 55459`,"-w","start"], { stdio:"pipe" });
    started = true;
    args = ["-X","-h",root,"-p","55459","-U","hra_test","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"];
    run(`CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL);
      CREATE TABLE cohorts(id uuid PRIMARY KEY,name text NOT NULL,"order" integer NOT NULL DEFAULT 0);
      CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id),title text NOT NULL,event_date timestamp NOT NULL DEFAULT now(),event_type text NOT NULL DEFAULT 'CLASS');
      CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id),content text,sub_title text,category text NOT NULL DEFAULT 'CLASSICS',"order" integer NOT NULL DEFAULT 0);
      INSERT INTO users VALUES('${actor}','FACULTY'),('${learner}','MEMBER');
      INSERT INTO cohorts(id,name) VALUES('${cohort}','시험 기수'),('${otherCohort}','다른 기수');`);
    for (const name of ["academic-students", "academic-assignments", "academic-submissions", "academic-assignment-actions"]) {
      run(readFileSync(`scripts/migrate-${name}.sql`, "utf8"));
    }
  }, 30000);
  beforeEach(() => {
    vi.stubEnv("ACADEMIC_ENABLED", "true");
    mocks.require.mockReset().mockResolvedValue(actor);
    mocks.execute.mockReset().mockImplementation(async (statement: SQL) => {
      const query = new PgDialect().sqlToQuery(statement);
      const parameters = query.params.map(value => value === null ? "NULL" : typeof value === "number" ? String(value) : quote(String(value)));
      const output = run(`PREPARE fixture_query AS SELECT row_to_json(q) FROM (${query.sql}) q;
        EXECUTE fixture_query${parameters.length ? `(${parameters.join(",")})` : ""};`);
      return { rows: output ? output.split("\n").map(line => JSON.parse(line)) : [] };
    });
    run(`UPDATE users SET role='FACULTY' WHERE id='${actor}';
      TRUNCATE assignment_submission_files,assignment_submissions,assignment_upload_intents,academic_assignment_events,
      assignment_targets,assignments,cohort_enrollments,academic_students;
      INSERT INTO academic_students(display_name,user_id) VALUES('연결 학생','${learner}');
      INSERT INTO academic_students(display_name) VALUES('미연결 학생'),('종료 학생'),('미래 학적'),('미래 생성'),('다른 기수');
      INSERT INTO cohort_enrollments(student_id,cohort_id,enrolled_at,created_at,ended_at)
        SELECT id,CASE WHEN display_name='다른 기수' THEN '${otherCohort}'::uuid ELSE '${cohort}'::uuid END,
          CASE WHEN display_name='미래 학적' THEN now()+interval '1 day' ELSE now()-interval '2 days' END,
          CASE WHEN display_name='미래 생성' THEN now()+interval '1 day' ELSE now()-interval '2 days' END,
          CASE WHEN display_name='종료 학생' THEN now()-interval '1 day' ELSE NULL END
        FROM academic_students;
      INSERT INTO assignments(id,cohort_id,title,instructions,due_at,created_by_user_id)
        VALUES('${assignment}','${cohort}','시험 과제','안내',now()+interval '3 days','${actor}');`);
  });
  afterAll(() => {
    vi.unstubAllEnvs();
    try { if (started) execFileSync(program("pg_ctl"), ["-D",join(root,"data"),"-m","immediate","-w","stop"], { stdio:"pipe" }); }
    finally { if (root) rmSync(root,{recursive:true,force:true}); }
  });
  it("전체 공개 비활성 시 준비 여부 조회도 DB를 호출하지 않는다", async () => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    expect(await getAssignmentAdminAvailability()).toBe(false);
    await expect(getAssignmentAdmin(assignment)).rejects.toThrow("준비");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("인증 직후 역할이 철회되면 준비 조회와 실제 데이터 조회를 403 오류로 거부한다", async () => {
    let changed = false;
    mocks.require.mockImplementation(async () => {
      if (!changed) { run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`); changed = true; }
      return actor;
    });
    await expect(getAssignmentAdminAvailability()).rejects.toMatchObject({ status: 403, message: "학사 운영 책임자만 과제를 조회할 수 있습니다." });
    await expect(getAssignmentAdmin(assignment)).rejects.toMatchObject({ status: 403 });
  });
  it("준비 확인 뒤 데이터 SQL 전에 역할이 철회되어도 빈 상세나 0명으로 성공하지 않는다", async () => {
    const execute = mocks.execute.getMockImplementation()!;
    let count = 0;
    mocks.execute.mockImplementation(async (statement: SQL) => {
      const result = await execute(statement);
      if (++count === 1) run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);
      return result;
    });
    await expect(getAssignmentPublishPreview(assignment)).rejects.toMatchObject({ status: 403 });
  });
  it("준비 이후 목록 서비스가 권한 철회로 빈 배열을 반환해도 성공한 빈 목록으로 처리하지 않는다", async () => {
    const execute = mocks.execute.getMockImplementation()!;
    let count = 0;
    mocks.execute.mockImplementation(async (statement: SQL) => {
      const result = await execute(statement);
      if (++count === 1) run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);
      return result;
    });
    await expect(getAssignmentAdminList({})).rejects.toMatchObject({ status: 403 });
  });
  it("실제 승인자와 서버 지정 계정이 다르면 현재 승인 역할이어도 SQL에서 거부한다", async () => {
    mocks.require.mockResolvedValue(learner);
    await expect(getAssignmentCohorts()).rejects.toMatchObject({ status: 403 });
  });
  it("각 폼 선택지 조회도 준비 확인 후 역할 철회 시 데이터를 반환하지 않는다", async () => {
    expect((await getAssignmentFormOptions()).cohorts).toHaveLength(2);
    const execute = mocks.execute.getMockImplementation()!;
    let count = 0;
    mocks.execute.mockImplementation(async (statement: SQL) => {
      const result = await execute(statement);
      if (++count === 1) run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);
      return result;
    });
    await expect(getAssignmentFormOptions()).rejects.toMatchObject({ status: 403 });
  });
  it("실제 유효 학생 2명과 미연결 1명만 계산하며 공개 SQL의 고정 대상과 일치한다", async () => {
    const preview = await getAssignmentPublishPreview(assignment);
    expect(preview).toMatchObject({ targetCount: 2, unlinkedCount: 1 });
    expect(preview).not.toBeNull();
    const result = JSON.parse(mutate("PUBLISH", { assignmentId: assignment,
      expectedUpdatedAt: preview!.expectedUpdatedAt, expectedTargetFingerprint: preview!.expectedTargetFingerprint }));
    expect(result.targetCount).toBe(2);
    expect(run(`SELECT encode(sha256(convert_to(string_agg(enrollment_id::text,',' ORDER BY enrollment_id),'UTF8')),'hex')
      FROM assignment_targets WHERE assignment_id='${assignment}';`)).toBe(preview!.expectedTargetFingerprint);
  });
  it("확인 후 명부 추가는 공개와 감사를 모두 롤백하며 새 확인으로 공개할 수 있다", async () => {
    const before = await getAssignmentPublishPreview(assignment);
    run(`INSERT INTO academic_students(display_name) VALUES('추가 학생');
      INSERT INTO cohort_enrollments(student_id,cohort_id) SELECT id,'${cohort}' FROM academic_students WHERE display_name='추가 학생';`);
    expect(() => mutate("PUBLISH", { assignmentId: assignment, expectedUpdatedAt: before!.expectedUpdatedAt,
      expectedTargetFingerprint: before!.expectedTargetFingerprint })).toThrow("공개 확인 이후 대상 명부가 변경되었습니다.");
    expect(counts()).toBe("0,0");
    const after = await getAssignmentPublishPreview(assignment);
    expect(after!.targetCount).toBe(3);
    expect(JSON.parse(mutate("PUBLISH", { assignmentId: assignment, expectedUpdatedAt: after!.expectedUpdatedAt,
      expectedTargetFingerprint: after!.expectedTargetFingerprint })).targetCount).toBe(3);
  });
  it("대상 없는 SHA256도 빈 문자열 합의 형식을 사용한다", async () => {
    run("DELETE FROM cohort_enrollments;");
    const preview = await getAssignmentPublishPreview(assignment);
    expect(preview?.targetCount).toBe(0);
    expect(preview?.expectedTargetFingerprint).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });
  it("상세와 목록은 실제 제출을 세고 제출 테이블 미준비를 0으로 처리하지 않는다", async () => {
    const preview = await getAssignmentPublishPreview(assignment);
    mutate("PUBLISH", { assignmentId: assignment, expectedUpdatedAt: preview!.expectedUpdatedAt, expectedTargetFingerprint: preview!.expectedTargetFingerprint });
    const target = run(`SELECT t.id FROM assignment_targets t JOIN cohort_enrollments e ON e.id=t.enrollment_id
      JOIN academic_students s ON s.id=e.student_id WHERE s.user_id='${learner}';`);
    const intent = randomUUID();
    run(`INSERT INTO assignment_upload_intents(id,assignment_target_id,user_id,storage_key,expires_at)
      VALUES('${intent}','${target}','${learner}','assignments/fixture/document.pdf',now()+interval '1 hour');
      SELECT verify_academic_assignment_upload('${intent}','${learner}','시험.pdf','application/pdf',1024,'${"a".repeat(64)}');
      SELECT finalize_academic_assignment_submission('${target}','${learner}','${intent}','${randomUUID()}');`);
    expect((await getAssignmentAdmin(assignment))?.submissionCount).toBe(1);
    expect((await getAssignmentAdminList({}))[0]?.submissionCount).toBe(1);
    run("ALTER TABLE assignment_submissions RENAME TO fixture_hidden_submissions;");
    try {
      expect(await getAssignmentAdminAvailability()).toBe(false);
      await expect(getAssignmentAdmin(assignment)).rejects.toThrow("준비");
    } finally { run("ALTER TABLE fixture_hidden_submissions RENAME TO assignment_submissions;"); }
  });
});
