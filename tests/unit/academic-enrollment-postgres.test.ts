// @vitest-environment node
/**
 * #145 회원-학적 수동 승인 연결을 실제 격리 PostgreSQL로 검증합니다.
 * 운영 접속 정보는 사용하지 않으며 CLI dry-run·적용·재시도까지 직접 실행합니다.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { academicEnrollmentLinkBatches } from "@/lib/db/schema";

const bin = process.env.HRA_TEST_PG_BIN;
// 모든 식별자는 격리 DB 전용 예시입니다.
const actor = "10000000-0000-4000-8000-000000000001";
const user = "10000000-0000-4000-8000-000000000002";
const otherUser = "10000000-0000-4000-8000-000000000003";
const pendingUser = "10000000-0000-4000-8000-000000000004";
const student = "20000000-0000-4000-8000-000000000001";
const otherStudent = "20000000-0000-4000-8000-000000000002";
const cohort = "30000000-0000-4000-8000-000000000001";
const pastCohort = "30000000-0000-4000-8000-000000000002";
const request = "40000000-0000-4000-8000-000000000001";
const approval = "50000000-0000-4000-8000-000000000001";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const plan = () => ({
  requestId: request, approverUserId: actor, approvalReferenceId: approval,
  verificationMethod: "IN_PERSON",
  links: [{ studentId: student, userId: user, cohortId: cohort,
    expectedRole: "MEMBER", expectedCohortId: cohort as string | null }],
});
const apply = (input: unknown, actorId = actor, configuredId = actor) =>
  `SELECT public.apply_academic_enrollment_links('${actorId}', '${configuredId}', ${quote(JSON.stringify(input))}::jsonb);`;

describe.skipIf(!bin)("회원-학적 승인 연결 PostgreSQL·CLI", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  let legacySnapshot: string;
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const counts = () => run(`SELECT jsonb_build_array(
    (SELECT count(*) FROM academic_students WHERE user_id IS NOT NULL),
    (SELECT count(*) FROM cohort_enrollments), (SELECT count(*) FROM academic_enrollment_link_batches));`);
  const legacy = () => run("SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u;");

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-academic-enrollment-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h 127.0.0.1 -k ${root} -p 55450`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55450", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE cohorts (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE users (id uuid PRIMARY KEY, name text NOT NULL, email text NOT NULL,
        role text NOT NULL, cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL,
        session_version integer NOT NULL DEFAULT 0, oauth_provider text, oauth_provider_account_id text);
      INSERT INTO cohorts VALUES ('${cohort}', '시험 현재 기수'), ('${pastCohort}', '시험 과거 기수');
      INSERT INTO users (id, name, email, role, cohort_id, oauth_provider, oauth_provider_account_id) VALUES
        ('${actor}', '책임자 개인정보', 'approver@example.invalid', 'ADMIN', NULL, NULL, NULL),
        ('${user}', '학생 개인정보', 'private@example.invalid', 'MEMBER', '${cohort}', 'kakao', 'private-binding'),
        ('${otherUser}', '동명이인 개인정보', 'other@example.invalid', 'FACULTY', NULL, NULL, NULL),
        ('${pendingUser}', '승인대기 개인정보', 'pending@example.invalid', 'PENDING', NULL, NULL, NULL);`);
    run(readFileSync("scripts/migrate-academic-students.sql", "utf8"));
    const migration = readFileSync("scripts/migrate-academic-enrollment-links.sql", "utf8");
    run(migration);
    run(migration);
    legacySnapshot = legacy();
  }, 30000);

  beforeEach(() => {
    run(`TRUNCATE academic_enrollment_link_batches, cohort_enrollments, academic_students;
      UPDATE users SET role = 'ADMIN' WHERE id = '${actor}';
      UPDATE users SET role = 'MEMBER', cohort_id = '${cohort}' WHERE id = '${user}';
      INSERT INTO academic_students (id, display_name) VALUES ('${student}', '학생 개인정보'), ('${otherStudent}', '동명이인 개인정보');`);
  });
  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("최초 연결·명시 기수 등록·최소 감사를 확정하고 기존 회원·OAuth·과거 이력을 보존한다", () => {
    run(`INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES ('${student}', '${pastCohort}');`);
    expect(JSON.parse(run(apply(plan())))).toMatchObject({ linkedCount: 1, enrolledCount: 1, replayed: false });
    expect(counts()).toBe("[1, 2, 1]");
    expect(legacy()).toBe(legacySnapshot);
    const audit = run("SELECT to_jsonb(b) FROM academic_enrollment_link_batches b;");
    expect(audit).toContain('"previousUserId": null');
    expect(audit).not.toContain("개인정보");
    expect(audit).not.toContain("example.invalid");
    expect(audit).not.toContain("private-binding");
  });

  it("감사 SQL의 컬럼·FK·CHECK 이름은 Drizzle 모델과 일치하고 다른 기존 구조를 거부한다", () => {
    const config = getTableConfig(academicEnrollmentLinkBatches);
    expect(JSON.parse(run(`SELECT jsonb_agg(jsonb_build_object('name', attname,
      'type', format_type(atttypid, atttypmod), 'notNull', attnotnull) ORDER BY attnum)
      FROM pg_attribute WHERE attrelid = 'academic_enrollment_link_batches'::regclass
        AND attnum > 0 AND NOT attisdropped;`)))
      .toEqual(config.columns.map(column => ({ name: column.name, type: column.getSQLType(), notNull: column.notNull })));
    for (const constraint of [...config.checks, ...config.foreignKeys]) {
      const name = "getName" in constraint ? constraint.getName() : constraint.name;
      expect(run(`SELECT count(*) FROM pg_constraint
        WHERE conrelid = 'academic_enrollment_link_batches'::regclass AND conname = '${name}';`)).toBe("1");
    }
    const migration = readFileSync("scripts/migrate-academic-enrollment-links.sql", "utf8");
    run("ALTER TABLE academic_enrollment_link_batches ALTER COLUMN created_at DROP DEFAULT;");
    try { expect(() => run(migration)).toThrow(); }
    finally { run("ALTER TABLE academic_enrollment_link_batches ALTER COLUMN created_at SET DEFAULT now();"); }
    run("ALTER TABLE academic_enrollment_link_batches DROP CONSTRAINT academic_enrollment_link_batches_linked_count_check; ALTER TABLE academic_enrollment_link_batches ADD CONSTRAINT academic_enrollment_link_batches_linked_count_check CHECK (linked_count > -100);");
    try { expect(() => run(migration)).toThrow(); }
    finally { run("ALTER TABLE academic_enrollment_link_batches DROP CONSTRAINT academic_enrollment_link_batches_linked_count_check; ALTER TABLE academic_enrollment_link_batches ADD CONSTRAINT academic_enrollment_link_batches_linked_count_check CHECK (linked_count >= 0);"); }
    run(migration);
    expect(legacy()).toBe(legacySnapshot);
  });

  it("같은 승인 계획 반복은 추가 행 없이 기존 결과를 반환하고 요청 ID 재사용은 거부한다", () => {
    const input = plan();
    run(apply(input));
    expect(JSON.parse(run(apply(input)))).toMatchObject({ linkedCount: 1, enrolledCount: 1, replayed: true });
    expect(counts()).toBe("[1, 1, 1]");
    expect(() => run(apply({ ...input, verificationMethod: "VERIFIED_CONTACT" }))).toThrow();
    const newRequest = { ...input, requestId: "40000000-0000-4000-8000-000000000002" };
    expect(JSON.parse(run(apply(newRequest)))).toMatchObject({ linkedCount: 0, enrolledCount: 0 });
    expect(counts()).toBe("[1, 1, 2]");
  });

  it.each(["FACULTY", "MEMBER"])("지정된 %s 책임자는 홈페이지 ADMIN 승격 없이 승인한다", role => {
    run(`UPDATE users SET role = '${role}' WHERE id = '${actor}';`);
    expect(JSON.parse(run(apply(plan())))).toMatchObject({ linkedCount: 1, enrolledCount: 1 });
    expect(run(`SELECT role FROM users WHERE id = '${actor}';`)).toBe(role);
  });

  it("지정 책임자 불일치·권한 회수·PENDING·역할/기수 변경·없는 계정을 차단한다", () => {
    expect(() => run(apply(plan(), actor, otherUser))).toThrow();
    run(`UPDATE users SET role = 'PENDING' WHERE id = '${actor}';`);
    expect(() => run(apply(plan()))).toThrow();
    run(`UPDATE users SET role = 'ADMIN' WHERE id = '${actor}';`);
    const input = plan();
    input.links[0].userId = pendingUser;
    expect(() => run(apply(input))).toThrow();
    run(`UPDATE users SET role = 'FACULTY' WHERE id = '${user}';`);
    expect(() => run(apply(plan()))).toThrow();
    run(`UPDATE users SET role = 'MEMBER', cohort_id = NULL WHERE id = '${user}';`);
    expect(() => run(apply(plan()))).toThrow();
    run(`DELETE FROM users WHERE id = '${user}';`);
    try { expect(() => run(apply(plan()))).toThrow(); }
    finally {
      run(`INSERT INTO users (id, name, email, role, cohort_id, oauth_provider, oauth_provider_account_id)
        VALUES ('${user}', '학생 개인정보', 'private@example.invalid', 'MEMBER', '${cohort}', 'kakao', 'private-binding');`);
    }
    expect(counts()).toBe("[0, 0, 0]");
  });

  it("기존 다른 연결·계정 중복·계획 중복을 거부하며 부분 등록도 남기지 않는다", () => {
    run(`UPDATE academic_students SET user_id = '${otherUser}' WHERE id = '${student}';`);
    expect(() => run(apply(plan()))).toThrow();
    run(`UPDATE academic_students SET user_id = NULL WHERE id = '${student}';
      UPDATE academic_students SET user_id = '${user}' WHERE id = '${otherStudent}';`);
    expect(() => run(apply(plan()))).toThrow();
    run(`UPDATE academic_students SET user_id = NULL;`);
    const input = plan();
    input.links.push({ ...input.links[0], studentId: otherStudent });
    expect(() => run(apply(input))).toThrow();
    input.links[1].userId = otherUser;
    // 두 번째 항목이 현재 역할과 달라 첫 항목이 이미 처리됐더라도 모두 취소합니다.
    expect(() => run(apply(input))).toThrow();
    expect(counts()).toBe("[0, 0, 0]");
  });

  it("감사 저장 실패 또는 커밋 전 중단은 모든 연결·등록을 취소한다", () => {
    run(`ALTER TABLE academic_enrollment_link_batches ADD CONSTRAINT test_audit_failure CHECK (false);`);
    try { expect(() => run(apply(plan()))).toThrow(); }
    finally { run("ALTER TABLE academic_enrollment_link_batches DROP CONSTRAINT test_audit_failure;"); }
    expect(counts()).toBe("[0, 0, 0]");
    run(`BEGIN; ${apply(plan())}`);
    expect(counts()).toBe("[0, 0, 0]");
    run(apply(plan()));
    expect(counts()).toBe("[1, 1, 1]");
    expect(() => run(`DELETE FROM users WHERE id = '${user}';`)).toThrow();
    expect(() => run(`DELETE FROM users WHERE id = '${actor}';`)).toThrow();
  });

  it("한 계정의 동시 학생 연결은 하나만 확정한다", async () => {
    const first = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const second = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const done = (child: typeof first) => new Promise<number | null>((resolve, reject) => {
      child.on("error", reject); child.on("close", resolve);
    });
    const firstDone = done(first);
    const secondDone = done(second);
    const waitFor = async (query: string) => {
      for (let i = 0; i < 100; i++) {
        if (run(query) === "1") return;
        await delay(20);
      }
      throw new Error("동시 연결 잠금 상태를 확인하지 못했습니다.");
    };
    try {
      first.stdin.write(`SET application_name = 'enrollment_link_first'; BEGIN; ${apply(plan())}\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'enrollment_link_first' AND state = 'idle in transaction';");
      const secondPlan = plan();
      secondPlan.requestId = "40000000-0000-4000-8000-000000000002";
      secondPlan.links[0].studentId = otherStudent;
      second.stdin.end(`SET application_name = 'enrollment_link_second'; ${apply(secondPlan)}`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'enrollment_link_second' AND wait_event_type = 'Lock';");
      first.stdin.end("COMMIT;\n");
      expect(await firstDone).toBe(0);
      expect(await secondDone).toBe(3);
      expect(counts()).toBe("[1, 1, 1]");
    } finally {
      for (const child of [first, second]) {
        if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n");
        if (child.exitCode === null) child.kill();
      }
      await Promise.all([firstDone, secondDone]);
    }
  }, 15000);

  it.each(["role", "delete"])("계정 %s가 먼저 확정되면 대기 중 연결을 원자적으로 거부한다", async operation => {
    const change = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const linking = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const done = (child: typeof change) => new Promise<number | null>((resolve, reject) => {
      child.on("error", reject); child.on("close", resolve);
    });
    const changeDone = done(change);
    const linkingDone = done(linking);
    const waitFor = async (query: string) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run(query) === "1") return;
        await delay(20);
      }
      throw new Error("계정 변경 경합의 잠금 상태를 확인하지 못했습니다.");
    };
    try {
      const mutation = operation === "role"
        ? `UPDATE users SET role = 'PENDING' WHERE id = '${user}';`
        : `DELETE FROM users WHERE id = '${user}';`;
      change.stdin.write(`SET application_name = 'enrollment_account_change'; BEGIN; ${mutation}\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'enrollment_account_change' AND state = 'idle in transaction';");
      linking.stdin.end(`SET application_name = 'enrollment_link_waiting'; ${apply(plan())}`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'enrollment_link_waiting' AND wait_event_type = 'Lock';");
      change.stdin.end("COMMIT;\n");
      expect(await changeDone).toBe(0);
      expect(await linkingDone).toBe(3);
      expect(counts()).toBe("[0, 0, 0]");
    } finally {
      for (const child of [change, linking]) {
        if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n");
        if (child.exitCode === null) child.kill();
      }
      await Promise.all([changeDone, linkingDone]);
      run(`INSERT INTO users (id, name, email, role, cohort_id, oauth_provider, oauth_provider_account_id)
        VALUES ('${user}', '학생 개인정보', 'private@example.invalid', 'MEMBER', '${cohort}', 'kakao', 'private-binding')
        ON CONFLICT (id) DO UPDATE SET role = 'MEMBER', cohort_id = '${cohort}';`);
    }
  }, 15000);

  it("CLI 기본 dry-run·안전 조건 실패·적용·응답 유실 재실행을 실제 DB에서 검증한다", () => {
    const file = join(root, "approved-plan.json");
    writeFileSync(file, JSON.stringify(plan()), { mode: 0o600 });
    const env = { ...process.env,
      DATABASE_URL: "postgresql://hra_test:test-secret-value@127.0.0.1:55450/postgres?sslmode=disable",
      PGHOSTADDR: "203.0.113.254", PGSERVICE: "nonexistent-test-service",
      HRA_PSQL_BIN: program("psql"), ACADEMIC_APPROVER_USER_ID: actor,
      ACADEMIC_ENROLLMENT_WRITES_ENABLED: "true" };
    const cli = (args: string[], variables = env) => spawnSync(process.execPath,
      ["scripts/backfill-academic-enrollments.mjs", ...args], { env: variables, encoding: "utf8" });
    const dry = cli([`--plan=${file}`]);
    expect(dry.status).toBe(0);
    expect(dry.stdout).toContain("읽기 전용 점검 완료");
    expect(dry.stdout).toContain('"studentExists": true');
    for (const secret of ["개인정보", "example.invalid", "private-binding", "test-secret-value", "postgresql://"]) {
      expect(dry.stdout + dry.stderr).not.toContain(secret);
    }
    expect(counts()).toBe("[0, 0, 0]");
    const fingerprint = /대상 확인값: ([a-f0-9]{16})/.exec(dry.stdout)?.[1];
    const args = ["--apply", `--plan=${file}`, "--expect=1", `--confirm-target=${fingerprint}`];
    expect(cli(args.slice(0, -1)).status).toBe(1);
    expect(cli(args.map(arg => arg === "--expect=1" ? "--expect=2" : arg)).status).toBe(1);
    expect(cli(args, { ...env, ACADEMIC_APPROVER_USER_ID: "" }).status).toBe(1);
    expect(cli(args, { ...env, ACADEMIC_ENROLLMENT_WRITES_ENABLED: "false" }).status).toBe(1);
    expect(counts()).toBe("[0, 0, 0]");
    expect(cli(args).status).toBe(0);
    const replay = cli(args);
    expect(replay.status).toBe(0);
    expect(replay.stdout).toContain('"replayed": true');
    expect(counts()).toBe("[1, 1, 1]");
    expect(legacy()).toBe(legacySnapshot);
  }, 15000);
});
