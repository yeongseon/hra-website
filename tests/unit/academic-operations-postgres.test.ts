// @vitest-environment node
/**
 * 운영 지표 SQL을 실제 격리 PostgreSQL에서 실행하고 합성 최종 제출을 빈 DB에 복원합니다.
 * 운영 환경을 상속하지 않고 소켓만 열며 DB 덤프·파일 경로·본문은 출력하지 않습니다.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { execute: vi.fn() } }));
import { academicHealthMetricsSql } from "@/lib/academic-health";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const cohort = "20000000-0000-4000-8000-000000000001";
const student = "30000000-0000-4000-8000-000000000001";
const assignment = "40000000-0000-4000-8000-000000000001";
const intent = "50000000-0000-4000-8000-000000000001";
const submissionKey = "60000000-0000-4000-8000-000000000001";

describe.skipIf(!bin)("학사 상태 집계와 격리 복원", () => {
  let root: string;
  let started = false;
  let environment: Record<string, string>;
  const invoke = (name: string, args: string[], input?: string | Buffer, database = "postgres") =>
    execFileSync(join(bin!, name), args, { input, env: { NODE_ENV: "test", ...environment, PGDATABASE: database }, stdio: ["pipe", "pipe", "pipe"], timeout: 30_000 });
  const run = (query: string, database = "postgres") => invoke("psql", ["-X", "-Atq", "-v", "ON_ERROR_STOP=1"], query, database).toString().trim();
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-academic-observe-"));
    environment = { LC_ALL: "C", PGHOST: root, PGPORT: "55457", PGUSER: "hra_test", PGDATABASE: "postgres",
      PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5", PGPASSWORD: "" };
    invoke("initdb", ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"]);
    invoke("pg_ctl", ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55457`, "-w", "start"]);
    started = true;
  }, 30_000);
  afterAll(() => {
    try { if (started) invoke("pg_ctl", ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"]); }
    finally { if (root) rmSync(root, { recursive: true, force: true }); }
  });

  it("정확한 집계·현재 역할 철회·읽기 전용 실행을 확인합니다", () => {
    // 집계 SQL 자체의 경계값을 확인하기 위한 최소 표입니다. 업로드 migration 검증은 별도 테스트가 담당합니다.
    run(`CREATE TABLE users(id uuid PRIMARY KEY,role text);
      CREATE TABLE assignment_upload_intents(id uuid PRIMARY KEY,state text,expires_at timestamptz,storage_key text);
      CREATE TABLE assignment_submissions(upload_intent_id uuid);
      CREATE TABLE assignment_submission_files(storage_key text);
      CREATE TABLE academic_upload_authorizations(intent_id uuid,cleanup_claimed_at timestamptz,deleted_at timestamptz);
      INSERT INTO users VALUES('${actor}','FACULTY');
      INSERT INTO assignment_upload_intents VALUES
        ('${intent}','INTENDED',now()-interval '10 minutes','synthetic/pending.pdf'),
        ('50000000-0000-4000-8000-000000000002','VERIFIED',now()+interval '10 minutes','synthetic/verified.pdf'),
        ('50000000-0000-4000-8000-000000000003','EXPIRED',now()-interval '10 minutes','synthetic/claimed.pdf'),
        ('50000000-0000-4000-8000-000000000004','CONSUMED',now()-interval '10 minutes','synthetic/final.pdf');
      INSERT INTO academic_upload_authorizations VALUES
        ('${intent}',NULL,NULL),('50000000-0000-4000-8000-000000000003',now(),NULL),
        ('50000000-0000-4000-8000-000000000004',NULL,now());
      INSERT INTO assignment_submissions VALUES('50000000-0000-4000-8000-000000000004');
      INSERT INTO assignment_submission_files VALUES('synthetic/final.pdf');`);
    const compiled = new PgDialect().sqlToQuery(academicHealthMetricsSql(actor));
    expect(compiled.params).toEqual([actor]);
    const query = compiled.sql.replace("$1", `'${actor}'`);
    expect(run(`BEGIN READ ONLY; ${query}; COMMIT;`)).toBe("2|2|1|1|1|1");
    run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);
    expect(run(query)).toBe("");
  });

  it("실제 학사 제약·최종 제출·파일 참조를 새 빈 DB에 복원하고 무결성을 비교합니다", () => {
    invoke("createdb", ["restore_source"]);
    invoke("createdb", ["restore_target"]);
    const source = (query: string) => run(query, "restore_source");
    source(`CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL DEFAULT 'MEMBER',cohort_id uuid);
      CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));
      INSERT INTO cohorts VALUES('${cohort}'); INSERT INTO users(id) VALUES('${actor}');`);
    for (const name of ["students", "enrollment-links", "roster", "assignments", "submissions", "assignment-actions"]) {
      source(readFileSync(`scripts/migrate-academic-${name}.sql`, "utf8"));
    }
    // Blob은 로컬 합성 바이트로만 재현합니다. 실제 공급자 복원 가능성을 주장하지 않습니다.
    const body = Buffer.from("%PDF-1.7\nsynthetic restoration fixture\n%%EOF\n");
    const checksum = createHash("sha256").update(body).digest("hex");
    source(`INSERT INTO academic_students(id,user_id,display_name) VALUES('${student}','${actor}','합성 복원 학생');
      INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${student}','${cohort}');
      INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)
        VALUES('${assignment}','${cohort}','합성 복원 과제',now()+interval '1 hour','${actor}');
      SELECT publish_academic_assignment('${assignment}','${actor}');
      INSERT INTO assignment_upload_intents(id,assignment_target_id,user_id,storage_key,expires_at)
        SELECT '${intent}',id,'${actor}','assignments/synthetic/restore.pdf',now()+interval '30 minutes'
        FROM assignment_targets WHERE assignment_id='${assignment}';
      SELECT verify_academic_assignment_upload('${intent}','${actor}','합성복원.pdf','application/pdf',${body.length},'${checksum}');
      SELECT finalize_academic_assignment_submission(id,'${actor}','${intent}','${submissionKey}')
        FROM assignment_targets WHERE assignment_id='${assignment}';`);
    source(`SELECT mutate_academic_assignment('CREATE','${actor}','${actor}',
      '70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
      '{"cohortId":"${cohort}","scheduleEventId":null,"scheduleSessionId":null,"title":"합성 감사 복원 과제","instructions":"","dueAt":null}'::jsonb);`);
    const fingerprintQuery = `SELECT md5(jsonb_agg(row_to_json(snapshot) ORDER BY relation_name)::text) FROM (
      SELECT 'student' AS relation_name,to_jsonb(s) AS record FROM academic_students s
      UNION ALL SELECT 'enrollment',to_jsonb(e) FROM cohort_enrollments e
      UNION ALL SELECT 'assignment',to_jsonb(a) FROM assignments a
      UNION ALL SELECT 'target',to_jsonb(t) FROM assignment_targets t
      UNION ALL SELECT 'intent',to_jsonb(i) FROM assignment_upload_intents i
      UNION ALL SELECT 'submission',to_jsonb(s) FROM assignment_submissions s
      UNION ALL SELECT 'file',to_jsonb(f) FROM assignment_submission_files f
      UNION ALL SELECT 'assignment_audit',to_jsonb(a) FROM academic_assignment_events a
      UNION ALL SELECT 'enrollment_audit',to_jsonb(a) FROM academic_enrollment_link_batches a
      UNION ALL SELECT 'registration_audit',to_jsonb(a) FROM academic_roster_registrations a) snapshot;`;
    const before = source(fingerprintQuery);
    const dump = invoke("pg_dump", ["--no-owner", "--no-privileges"], undefined, "restore_source");
    invoke("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1"], dump, "restore_target");
    expect(run(fingerprintQuery, "restore_target")).toBe(before);
    expect(run("SELECT count(*) FROM academic_assignment_events;", "restore_target")).toBe("1");
    expect(run(`SELECT count(*) FROM assignment_submission_files f JOIN assignment_submissions s ON s.id=f.submission_id
      JOIN assignment_upload_intents i ON i.id=s.upload_intent_id WHERE i.state='CONSUMED' AND f.storage_key=i.storage_key
      AND f.checksum='${checksum}' AND f.size_bytes=${body.length};`, "restore_target")).toBe("1");
    expect(run(`SELECT count(*) FROM pg_constraint WHERE NOT convalidated;`, "restore_target")).toBe("0");
    expect(run(`SELECT count(*) FROM assignment_submissions;`, "restore_target")).toBe("1");
    run(`SELECT finalize_academic_assignment_submission(id,'${actor}','${intent}','${submissionKey}')
      FROM assignment_targets WHERE assignment_id='${assignment}';`, "restore_target");
    expect(run(`SELECT count(*) FROM assignment_submissions;`, "restore_target")).toBe("1");
    expect(() => run(`SELECT finalize_academic_assignment_submission(id,'${actor}','${intent}',
      '90000000-0000-4000-8000-000000000001') FROM assignment_targets WHERE assignment_id='${assignment}';`, "restore_target")).toThrow();
    expect(() => run("DELETE FROM assignment_submissions;", "restore_target")).toThrow();
  }, 30_000);
});
