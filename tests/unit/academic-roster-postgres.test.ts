// @vitest-environment node
/** 등록 함수의 실패 롤백·동명이인·기존 학생 등록·재시도·동시성을 실제 격리 PostgreSQL에서 검증한다. */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { academicRosterRegistrations } from "@/lib/db/academic-roster";
const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const cohort = "20000000-0000-4000-8000-000000000001";
const otherCohort = "20000000-0000-4000-8000-000000000002";
const evidence = "30000000-0000-4000-8000-000000000001";
const migrations = ["scripts/migrate-academic-students.sql", "scripts/migrate-academic-roster.sql"].map(path => readFileSync(path, "utf8"));

describe.skipIf(!bin)("학생 명부 원자 등록", () => {
  let root: string;
  let started = false;
  let args: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), args, { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const registration = (request = randomUUID(), student = "NULL", name = "'학생 가'", cohortId = cohort, actorId = actor) =>
    `SELECT * FROM register_academic_roster('${request}', '${actorId}', '${cohortId}', ${student}, ${name}, 'IN_PERSON', '${evidence}');`;
  const totals = () => run("SELECT (SELECT count(*) FROM academic_students) || ',' || (SELECT count(*) FROM cohort_enrollments) || ',' || (SELECT count(*) FROM academic_roster_registrations);");
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-academic-roster-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55456`, "-w", "start"], { stdio: "pipe" });
    started = true;
    args = ["-X", "-h", root, "-p", "55456", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE users(id uuid PRIMARY KEY); CREATE TABLE cohorts(id uuid PRIMARY KEY);
      INSERT INTO users VALUES ('${actor}'); INSERT INTO cohorts VALUES ('${cohort}'), ('${otherCohort}');`);
    for (const migration of migrations) run(migration);
    run(migrations[1]);
  }, 30000);
  beforeEach(() => run("TRUNCATE academic_roster_registrations, cohort_enrollments, academic_students;"));
  afterAll(() => {
    try { if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" }); }
    finally { if (root) rmSync(root, { recursive: true, force: true }); }
  });
  it("Drizzle 감사 모델과 실제 컬럼·FK·UNIQUE·CHECK 이름이 일치한다", () => {
    const config = getTableConfig(academicRosterRegistrations);
    const columns = JSON.parse(run(`SELECT json_agg(json_build_object('name', a.attname,
      'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull) ORDER BY a.attnum)
      FROM pg_attribute a WHERE a.attrelid = 'academic_roster_registrations'::regclass
      AND a.attnum > 0 AND NOT a.attisdropped;`));
    expect(columns).toEqual(config.columns.map(column => ({ name: column.name,
      type: column.getSQLType().replace(/^varchar\(/, "character varying("), notNull: column.notNull })));
    for (const fk of config.foreignKeys) {
      expect(run(`SELECT confdeltype FROM pg_constraint WHERE conrelid = 'academic_roster_registrations'::regclass AND conname = '${fk.getName()}';`)).toBe("r");
    }
    for (const check of config.checks) expect(run(`SELECT count(*) FROM pg_constraint
      WHERE conrelid = 'academic_roster_registrations'::regclass AND conname = '${check.name}' AND contype = 'c';`)).toBe("1");
    expect(run("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'academic_roster_registrations_enrollment_id_unique';")).toBe("UNIQUE (enrollment_id)");
  });
  it("신규 학생·등록·감사가 함께 생성되고 이름/연락처를 감사에 복제하지 않는다", () => {
    run(registration());
    expect(totals()).toBe("1,1,1");
    expect(run("SELECT count(*) FROM academic_students WHERE user_id IS NULL;")).toBe("1");
    const row = run("SELECT to_jsonb(r) FROM academic_roster_registrations r;");
    expect(row).not.toContain("학생 가");
    expect(run("SELECT length(request_fingerprint) FROM academic_roster_registrations;")).toBe("64");
  });
  it("동일 요청 재시도는 동일 결과를 반환하고 내용 변경은 거부한다", () => {
    const request = randomUUID();
    const first = run(registration(request));
    expect(run(registration(request))).toBe(first);
    expect(() => run(registration(request, "NULL", "'학생 나'"))).toThrow(/roster_request_conflict/);
    expect(totals()).toBe("1,1,1");
  });
  it("동명이인 신규 등록은 별개 학생으로 유지하고 기존 UUID 등록만 기수를 추가한다", () => {
    const student = run(registration()).split("|")[0];
    run(registration());
    expect(totals()).toBe("2,2,2");
    run(registration(randomUUID(), `'${student}'`, "NULL", otherCohort));
    expect(totals()).toBe("2,3,3");
    expect(() => run(registration(randomUUID(), `'${student}'`, "NULL"))).toThrow(/cohort_enrollments_student_cohort_unique/);
    expect(totals()).toBe("2,3,3");
  });
  it("없는 기수·기존 학생·승인자를 거부하고 생성한 학생까지 전부 롤백한다", () => {
    expect(() => run(registration(randomUUID(), "NULL", "'학생 가'", randomUUID()))).toThrow(/roster_missing_cohort/);
    expect(() => run(registration(randomUUID(), `'${randomUUID()}'`, "NULL"))).toThrow(/roster_missing_student/);
    // 학생 INSERT 후 학적 승인자 FK가 실패하는 경로에서도 신규 학생이 남지 않는다.
    expect(() => run(registration(randomUUID(), "NULL", "'학생 가'", cohort, randomUUID()))).toThrow();
    expect(totals()).toBe("0,0,0");
  });
  it("승인 감사 기록 실패 시 학생과 학적도 함께 롤백한다", () => {
    run("ALTER TABLE academic_roster_registrations ADD CONSTRAINT reject_for_test CHECK (false) NOT VALID;");
    try { expect(() => run(registration())).toThrow(/reject_for_test/); expect(totals()).toBe("0,0,0"); }
    finally { run("ALTER TABLE academic_roster_registrations DROP CONSTRAINT reject_for_test;"); }
  });
  it("기존 학생에 이름을 함께 보내거나 빈 신규 이름을 보내면 거부한다", () => {
    expect(() => run(registration(randomUUID(), `'${randomUUID()}'`))).toThrow(/roster_invalid_input/);
    expect(() => run(registration(randomUUID(), "NULL", "'  '"))).toThrow(/roster_invalid_input/);
    expect(totals()).toBe("0,0,0");
  });
  it("재실행 시 기존 감사 표의 열 타입이나 제약 불일치를 덮어쓰지 않는다", () => {
    run("ALTER TABLE academic_roster_registrations DROP CONSTRAINT academic_roster_registrations_request_fingerprint_check;");
    try { expect(() => run(migrations[1])).toThrow(/roster_migration_constraint_mismatch/); }
    finally { run("ALTER TABLE academic_roster_registrations ADD CONSTRAINT academic_roster_registrations_request_fingerprint_check CHECK (request_fingerprint ~ '^[0-9a-f]{64}$');"); }
    run(migrations[1]);
    run("ALTER TABLE academic_roster_registrations DROP CONSTRAINT academic_roster_registrations_cohort_fk; ALTER TABLE academic_roster_registrations ADD CONSTRAINT academic_roster_registrations_cohort_fk FOREIGN KEY(cohort_id) REFERENCES users(id) ON DELETE RESTRICT;");
    try { expect(() => run(migrations[1])).toThrow(/roster_migration_constraint_mismatch/); }
    finally { run("ALTER TABLE academic_roster_registrations DROP CONSTRAINT academic_roster_registrations_cohort_fk; ALTER TABLE academic_roster_registrations ADD CONSTRAINT academic_roster_registrations_cohort_fk FOREIGN KEY(cohort_id) REFERENCES cohorts(id) ON DELETE RESTRICT;"); }
    run(migrations[1]);
  });
  it.each([
    ["생성 시각 기본값 누락", "ALTER TABLE academic_roster_registrations ALTER COLUMN created_at DROP DEFAULT;",
      "ALTER TABLE academic_roster_registrations ALTER COLUMN created_at SET DEFAULT now();"],
    ["다른 생성 시각 기본값", "ALTER TABLE academic_roster_registrations ALTER COLUMN created_at SET DEFAULT clock_timestamp();",
      "ALTER TABLE academic_roster_registrations ALTER COLUMN created_at SET DEFAULT now();"],
    ["다른 열의 기본값 추가", "ALTER TABLE academic_roster_registrations ALTER COLUMN evidence_reference SET DEFAULT gen_random_uuid();",
      "ALTER TABLE academic_roster_registrations ALTER COLUMN evidence_reference DROP DEFAULT;"],
    ["RLS 활성화", "ALTER TABLE academic_roster_registrations ENABLE ROW LEVEL SECURITY;",
      "ALTER TABLE academic_roster_registrations DISABLE ROW LEVEL SECURITY;"],
    ["강제 RLS", "ALTER TABLE academic_roster_registrations FORCE ROW LEVEL SECURITY;",
      "ALTER TABLE academic_roster_registrations NO FORCE ROW LEVEL SECURITY;"],
    ["추가 인덱스", "CREATE INDEX unexpected_roster_actor_idx ON academic_roster_registrations(actor_user_id);",
      "DROP INDEX unexpected_roster_actor_idx;"],
    ["사용자 트리거", `CREATE FUNCTION unexpected_roster_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;
      CREATE TRIGGER unexpected_roster_trigger BEFORE INSERT ON academic_roster_registrations FOR EACH ROW EXECUTE FUNCTION unexpected_roster_trigger();`,
      "DROP TRIGGER unexpected_roster_trigger ON academic_roster_registrations; DROP FUNCTION unexpected_roster_trigger();"],
    // 격리 클러스터의 카탈로그만 조작하여 인덱스 개수는 같지만 유효하지 않은 상태를 재현한다.
    ["인덱스 유효성", "UPDATE pg_index SET indisvalid=false WHERE indexrelid='academic_roster_registrations_pkey'::regclass;",
      "UPDATE pg_index SET indisvalid=true WHERE indexrelid='academic_roster_registrations_pkey'::regclass;"],
  ])("%s 불일치 시 덮어쓰지 않고 실패하며 원복 뒤 재실행된다", (_name, damage, repair) => {
    const before = totals();
    run(damage);
    try {
      expect(() => run(migrations[1])).toThrow(/roster_migration_(schema|structure)_mismatch/);
      expect(totals()).toBe(before);
    } finally { run(repair); }
    run(migrations[1]);
    expect(totals()).toBe(before);
  });
  it("동일 요청의 동시 실행도 한 학생·한 등록·한 감사만 만든다", async () => {
    const request = randomUUID();
    const execute = () => new Promise<string>((resolve, reject) => {
      const child = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
      let output = ""; let error = "";
      child.stdout.on("data", value => { output += String(value); });
      child.stderr.on("data", value => { error += String(value); });
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve(output.trim()) : reject(new Error(error)));
      child.stdin.end(registration(request));
    });
    const results = await Promise.all([execute(), execute()]);
    expect(results[0]).toBe(results[1]); expect(totals()).toBe("1,1,1");
  });
});
