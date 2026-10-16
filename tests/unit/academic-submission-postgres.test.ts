// @vitest-environment node
/**
 * #148 최종 제출 모델을 실제 격리 PostgreSQL에서 검증한다.
 * 운영 접속정보를 읽지 않으며 원자성·멱등·경합·드리프트·Drizzle 카탈로그를 확인한다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assignmentSubmissionFiles, assignmentSubmissions, assignmentUploadIntents } from "@/lib/db/academic-submissions";

const bin = process.env.HRA_TEST_PG_BIN;
const migration = readFileSync("scripts/migrate-academic-submissions.sql", "utf8");
// 아래 식별자는 격리 테스트 전용이다.
const user = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const student = "30000000-0000-4000-8000-000000000001";
const assignment = "40000000-0000-4000-8000-000000000001";
const intent = "50000000-0000-4000-8000-000000000001";
const intent2 = "50000000-0000-4000-8000-000000000002";
const key = "60000000-0000-4000-8000-000000000001";
const key2 = "60000000-0000-4000-8000-000000000002";
const checksum = "a".repeat(64);

describe.skipIf(!bin)("과제 최종 제출 migration", () => {
  let root: string;
  let started = false;
  let args: string[];
  let target: string;
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), args, { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const makeIntent = (id = intent, path = "assignments/test/document.pdf") => run(`INSERT INTO assignment_upload_intents(id,assignment_target_id,user_id,storage_key,expires_at)
    VALUES('${id}','${target}','${user}','${path}',clock_timestamp()+interval '30 minutes');`);
  const verify = (id = intent, size = 2048, mime = "application/pdf", name = "과제.pdf") => run(`SELECT verify_academic_assignment_upload('${id}','${user}','${name}','${mime}',${size},'${checksum}');`);
  const finalizeSql = (requestKey = key, uploadId = intent, actor = user) => `SELECT finalize_academic_assignment_submission('${target}','${actor}','${uploadId}','${requestKey}');`;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-academic-submissions-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55453`, "-w", "start"], { stdio: "pipe" });
    started = true;
    args = ["-X", "-h", root, "-p", "55453", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL DEFAULT 'MEMBER');
      CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));
      INSERT INTO cohorts VALUES('${cohort}'); INSERT INTO users(id) VALUES('${user}'),('${other}');`);
    run(readFileSync("scripts/migrate-academic-students.sql", "utf8"));
    run(readFileSync("scripts/migrate-academic-assignments.sql", "utf8"));
    run(migration);
    run(migration);
  }, 30000);

  beforeEach(() => {
    run(`TRUNCATE assignment_submission_files,assignment_submissions,assignment_upload_intents,assignment_targets,assignments,cohort_enrollments,academic_students;
      UPDATE users SET role='MEMBER';
      INSERT INTO academic_students(id,user_id,display_name) VALUES('${student}','${user}','시험 학생');
      INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${student}','${cohort}');
      INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id) VALUES('${assignment}','${cohort}','시험 과제',clock_timestamp()+interval '1 hour','${user}');
      SELECT publish_academic_assignment('${assignment}','${user}');`);
    target = run(`SELECT id FROM assignment_targets WHERE assignment_id='${assignment}';`);
  });

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("Drizzle 컬럼·FK·유일성·CHECK가 SQL 카탈로그와 일치한다", () => {
    const dialect = new PgDialect();
    for (const table of [assignmentUploadIntents, assignmentSubmissions, assignmentSubmissionFiles]) {
      const config = getTableConfig(table);
      expect(JSON.parse(run(`SELECT json_agg(json_build_object('name',attname,'type',format_type(atttypid,atttypmod),'required',attnotnull) ORDER BY attnum)
        FROM pg_attribute WHERE attrelid='${config.name}'::regclass AND attnum>0 AND NOT attisdropped;`))).toEqual(config.columns.map(column => ({ name: column.name,
        type: column.getSQLType().replace(/^varchar\(/, "character varying("), required: column.notNull })));
      for (const fk of config.foreignKeys) expect(run(`SELECT confdeltype FROM pg_constraint WHERE conrelid='${config.name}'::regclass AND conname='${fk.getName()}';`)).toBe("r");
      for (const constraint of config.uniqueConstraints) expect(run(`SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='${config.name}'::regclass AND conname='${constraint.getName()}';`))
        .toBe(`UNIQUE (${constraint.columns.map(column => column.name).join(", ")})`);
      // Drizzle 표현식으로 만든 CHECK를 PostgreSQL에 정규화시켜 실제 CHECK 표현식과 비교한다.
      for (const constraint of config.checks) {
        const expression = dialect.sqlToQuery(constraint.value).sql.replaceAll(`"${config.name}".`, "");
        run(`ALTER TABLE ${config.name} ADD CONSTRAINT comparison_check CHECK (${expression});`);
        try {
          expect(run(`SELECT pg_get_expr(conbin,conrelid) FROM pg_constraint WHERE conrelid='${config.name}'::regclass AND conname='comparison_check';`))
            .toBe(run(`SELECT pg_get_expr(conbin,conrelid) FROM pg_constraint WHERE conrelid='${config.name}'::regclass AND conname='${constraint.name}';`));
        } finally { run(`ALTER TABLE ${config.name} DROP CONSTRAINT comparison_check;`); }
      }
    }
  });

  it("미검증 업로드만으로 최종 제출할 수 없고 검증 후 단일 파일과 함께 확정한다", () => {
    makeIntent();
    expect(() => run(finalizeSql())).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
    verify();
    const result = run(finalizeSql());
    expect(result).toMatch(/^[a-f0-9-]{36}$/);
    expect(run("SELECT state FROM assignment_upload_intents;")).toBe("CONSUMED");
    expect(run("SELECT count(*) FROM assignment_submission_files;")).toBe("1");
    run(migration);
    expect(run(finalizeSql())).toBe(result);
  });

  it("같은 키 재요청은 종료 이후에도 원본 ID를 반환하고 다른 키·의도·계정은 거부한다", () => {
    makeIntent(); verify();
    const result = run(finalizeSql());
    run(`UPDATE assignments SET status='CLOSED' WHERE id='${assignment}';`);
    expect(run(finalizeSql())).toBe(result);
    expect(() => run(finalizeSql(key2))).toThrow();
    expect(() => run(finalizeSql(key, intent2))).toThrow();
    expect(() => run(finalizeSql(key, intent, other))).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("1");
  });

  it("PDF·50MiB·파일명·체크섬·저장 키와 상태 제약이 잘못된 메타를 거부한다", () => {
    makeIntent();
    for (const query of [
      () => verify(intent, 52428801), () => verify(intent, 0), () => verify(intent, 1, "image/png"),
      () => verify(intent, 1, "application/pdf", "../과제.pdf"),
      () => run(`SELECT verify_academic_assignment_upload('${intent}','${user}','과제.pdf','application/pdf',1,'잘못된 해시');`),
      () => run(`UPDATE assignment_upload_intents SET state='CONSUMED' WHERE id='${intent}';`),
      () => makeIntent(intent2, "https://example.invalid/file.pdf"),
      () => makeIntent(intent2, "assignments/../file.pdf"),
      () => makeIntent(intent2),
    ]) expect(query).toThrow();
    verify(intent, 52428800);
    expect(run(finalizeSql())).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("다른 학생과 미연결 학생의 업로드를 거부하고 이력 생성 뒤 계정 연결 변경을 차단한다", () => {
    expect(() => run(`INSERT INTO assignment_upload_intents(assignment_target_id,user_id,storage_key,expires_at)
      VALUES('${target}','${other}','assignments/other.pdf',clock_timestamp()+interval '1 hour');`)).toThrow();
    run(`UPDATE academic_students SET user_id=NULL WHERE id='${student}';`);
    expect(() => makeIntent()).toThrow();
    run(`UPDATE academic_students SET user_id='${user}' WHERE id='${student}';`);
    makeIntent();
    expect(() => run(`UPDATE academic_students SET user_id='${other}' WHERE id='${student}';`)).toThrow();
    verify(); run(finalizeSql());
    expect(() => run(`UPDATE academic_students SET user_id=NULL WHERE id='${student}';`)).toThrow();
  });

  it.each(["REPEATABLE READ", "SERIALIZABLE"])("%s의 오래된 snapshot 뒤 생성된 최종 제출도 계정 변경에서 보호한다", async isolation => {
    // 첫 연결이 빈 의도 목록으로 snapshot을 확정한 뒤 두 번째 연결에서 최종 제출한다.
    const stale = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
    let staleError = "";
    stale.stderr.on("data", chunk => { staleError += String(chunk); });
    const done = new Promise<number | null>((resolve, reject) => { stale.on("close", resolve); stale.on("error", reject); });
    try {
      stale.stdin.write(`SET application_name='submission_stale_binding'; BEGIN ISOLATION LEVEL ${isolation};
        SELECT count(*) FROM assignment_upload_intents;\n`);
      let snapshotReady = false;
      for (let i = 0; i < 100; i++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_stale_binding' AND state='idle in transaction';") === "1") {
          snapshotReady = true; break;
        }
        await delay(20);
      }
      if (!snapshotReady) throw new Error("계정 변경 회귀 테스트의 고정 snapshot을 확인하지 못했습니다.");
      makeIntent(); verify();
      const originalSubmissionId = run(finalizeSql());
      stale.stdin.end(`UPDATE academic_students SET user_id='${other}' WHERE id='${student}'; COMMIT;`);
      expect(await done).toBe(3);
      expect(staleError).toContain("학생 계정 연결 변경은 READ COMMITTED");
      expect(run(`SELECT count(*) FROM assignment_upload_intents i JOIN assignment_targets t ON t.id=i.assignment_target_id
        JOIN cohort_enrollments e ON e.id=t.enrollment_id JOIN academic_students s ON s.id=e.student_id
        WHERE i.user_id IS DISTINCT FROM s.user_id;`)).toBe("0");
      expect(run(`SELECT user_id FROM academic_students WHERE id='${student}';`)).toBe(user);
      expect(run(finalizeSql())).toBe(originalSubmissionId);
    } finally {
      if (!stale.stdin.writableEnded) stale.stdin.end("ROLLBACK;\n");
      if (stale.exitCode === null) stale.kill();
      await done;
    }
  }, 15000);

  it("참조가 없어도 계정 연결 변경과 제출 소유권 검증은 고정 snapshot 격리수준을 거부한다", () => {
    expect(() => run(`BEGIN ISOLATION LEVEL REPEATABLE READ; UPDATE academic_students SET user_id='${other}' WHERE id='${student}'; COMMIT;`)).toThrow();
    expect(() => run(`BEGIN ISOLATION LEVEL REPEATABLE READ; INSERT INTO assignment_upload_intents(assignment_target_id,user_id,storage_key,expires_at)
      VALUES('${target}','${user}','assignments/stale.pdf',clock_timestamp()+interval '1 hour'); COMMIT;`)).toThrow();
    makeIntent();
    expect(() => run(`BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT verify_academic_assignment_upload('${intent}','${user}','과제.pdf','application/pdf',2048,'${checksum}'); COMMIT;`)).toThrow();
    expect(run("SELECT state FROM assignment_upload_intents;")).toBe("INTENDED");
    verify();
    expect(() => run(`BEGIN ISOLATION LEVEL REPEATABLE READ; ${finalizeSql()} COMMIT;`)).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
    expect(run("SELECT state FROM assignment_upload_intents;")).toBe("VERIFIED");
  });

  // 서버의 앞선 조회가 성공했어도 최종 DB 호출 시점의 역할·활성 학적을 다시 확인한다.
  const revocations = [
    { name: "PENDING 역할 철회", query: `UPDATE users SET role='PENDING' WHERE id='${user}';` },
    { name: "ADMIN 역할 변경", query: `UPDATE users SET role='ADMIN' WHERE id='${user}';` },
    { name: "FACULTY 역할 변경", query: `UPDATE users SET role='FACULTY' WHERE id='${user}';` },
    { name: "학적 종료", query: `UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE student_id='${student}';` },
    { name: "미래 등록 시각", query: `UPDATE cohort_enrollments SET enrolled_at=clock_timestamp()+interval '1 day' WHERE student_id='${student}';` },
    { name: "미래 학적 생성 시각", query: `UPDATE cohort_enrollments SET created_at=clock_timestamp()+interval '1 day' WHERE student_id='${student}';` },
  ];
  it.each(revocations)("$name 후 의도 생성·검증·새 최종화를 모두 거부한다", ({ query }) => {
    makeIntent(); verify();
    makeIntent(intent2, "assignments/second-unverified.pdf");
    run(query);
    expect(() => run(`INSERT INTO assignment_upload_intents(assignment_target_id,user_id,storage_key,expires_at)
      VALUES('${target}','${user}','assignments/revoked.pdf',clock_timestamp()+interval '1 hour');`)).toThrow();
    expect(() => verify(intent2)).toThrow();
    expect(() => run(finalizeSql())).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
    expect(run(`SELECT state FROM assignment_upload_intents WHERE id='${intent}';`)).toBe("VERIFIED");
    expect(run(`SELECT state FROM assignment_upload_intents WHERE id='${intent2}';`)).toBe("INTENDED");
  });

  it.each(revocations)("$name 후 동일 키 재시도도 현재 권한을 확인하여 거부하고 기존 기록은 보존한다", ({ query }) => {
    makeIntent(); verify(); run(finalizeSql());
    run(query);
    expect(() => run(finalizeSql())).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("1");
    expect(run("SELECT count(*) FROM assignment_submission_files;")).toBe("1");
    expect(run("SELECT state FROM assignment_upload_intents;")).toBe("CONSUMED");
  });

  it.each(revocations.filter(item => item.name === "PENDING 역할 철회" || item.name === "학적 종료"))(
    "$name 트랜잭션이 먼저 잠그면 동시 최종화는 기다린 뒤 철회를 반영한다", async ({ query }) => {
      makeIntent(); verify();
      const revoke = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
      const finalize = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
      let finalError = "";
      finalize.stderr.on("data", chunk => { finalError += String(chunk); });
      const done = [revoke, finalize].map(child => new Promise<number | null>((resolve, reject) => { child.on("close", resolve); child.on("error", reject); }));
      const waitFor = async (sql: string) => {
        for (let i = 0; i < 100; i++) { if (run(sql) === "1") return; await delay(20); }
        throw new Error("권한 철회와 최종화의 실제 잠금 경합을 확인하지 못했습니다.");
      };
      try {
        revoke.stdin.write(`SET application_name='submission_revoke_first'; BEGIN; ${query}\n`);
        await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_revoke_first' AND state='idle in transaction';");
        finalize.stdin.end(`SET application_name='submission_finalize_after'; ${finalizeSql()}`);
        await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_finalize_after' AND wait_event_type='Lock';");
        revoke.stdin.end("COMMIT;\n");
        expect(await done[0]).toBe(0); expect(await done[1]).toBe(3);
        expect(finalError).toMatch(/현재 학생 회원|유효한 등록 학적/);
        expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
        expect(run("SELECT state FROM assignment_upload_intents;")).toBe("VERIFIED");
      } finally {
        for (const child of [revoke, finalize]) { if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n"); if (child.exitCode === null) child.kill(); }
        await Promise.all(done);
      }
    }, 15000);

  it.each(revocations.filter(item => item.name === "PENDING 역할 철회" || item.name === "학적 종료"))(
    "$name보다 최종화가 먼저 잠그면 기록을 먼저 확정하고 이후 재시도는 철회를 반영한다", async ({ query }) => {
      makeIntent(); verify();
      const finalize = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
      const revoke = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
      let errors = "";
      for (const child of [finalize, revoke]) child.stderr.on("data", chunk => { errors += String(chunk); });
      const done = [finalize, revoke].map(child => new Promise<number | null>((resolve, reject) => { child.on("close", resolve); child.on("error", reject); }));
      const waitFor = async (sql: string) => {
        for (let i = 0; i < 100; i++) { if (run(sql) === "1") return; await delay(20); }
        throw new Error("최종화와 권한 철회의 실제 잠금 경합을 확인하지 못했습니다.");
      };
      try {
        finalize.stdin.write(`SET application_name='submission_finalize_first'; BEGIN; ${finalizeSql()}\n`);
        await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_finalize_first' AND state='idle in transaction';");
        revoke.stdin.end(`SET application_name='submission_revoke_after'; ${query}`);
        await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_revoke_after' AND wait_event_type='Lock';");
        finalize.stdin.end("COMMIT;\n");
        expect(await done[0]).toBe(0); expect(await done[1]).toBe(0); expect(errors).not.toContain("deadlock");
        expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("1");
        expect(() => run(finalizeSql())).toThrow();
      } finally {
        for (const child of [finalize, revoke]) { if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n"); if (child.exitCode === null) child.kill(); }
        await Promise.all(done);
      }
    }, 15000);

  it("만료 업로드·종료 과제의 신규 최종화와 서버 시각 변조를 차단한다", () => {
    run(`INSERT INTO assignment_upload_intents(id,assignment_target_id,user_id,storage_key,expires_at)
      VALUES('${intent}','${target}','${user}','assignments/expiry.pdf',clock_timestamp()+interval '100 milliseconds');`);
    run("SELECT pg_sleep(0.15);");
    expect(() => verify()).toThrow();
    run(`UPDATE assignment_upload_intents SET state='EXPIRED' WHERE id='${intent}';`);
    expect(() => run(finalizeSql())).toThrow();
    makeIntent(intent2, "assignments/second.pdf"); verify(intent2);
    run(`UPDATE assignments SET status='CLOSED' WHERE id='${assignment}';`);
    expect(() => run(finalizeSql(key, intent2))).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
  });

  it("파일 메타 INSERT 실패는 최종 행과 소비 상태까지 전체 롤백한다", () => {
    makeIntent(); verify();
    run("ALTER TABLE assignment_submission_files ADD CONSTRAINT simulated_file_failure CHECK (size_bytes < 10);");
    try {
      expect(() => run(finalizeSql())).toThrow();
      expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
      expect(run("SELECT count(*) FROM assignment_submission_files;")).toBe("0");
      expect(run("SELECT state FROM assignment_upload_intents;")).toBe("VERIFIED");
    } finally { run("ALTER TABLE assignment_submission_files DROP CONSTRAINT simulated_file_failure;"); }
    expect(run(finalizeSql())).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("직접 INSERT도 파일 없는 최종행·파일 메타 불일치·단독 소비를 커밋할 수 없다", () => {
    makeIntent(); verify();
    const insert = `INSERT INTO assignment_submissions(assignment_target_id,submitted_by_user_id,upload_intent_id,submission_key)
      VALUES('${target}','${user}','${intent}','${key}');`;
    expect(() => run(insert)).toThrow();
    expect(() => run(`UPDATE assignment_upload_intents SET state='CONSUMED' WHERE id='${intent}';`)).toThrow();
    expect(() => run(`BEGIN; ${insert}
      INSERT INTO assignment_submission_files(submission_id,storage_key,original_name,mime_type,size_bytes,checksum)
      SELECT id,'assignments/wrong.pdf','과제.pdf','application/pdf',2048,'${checksum}' FROM assignment_submissions;
      UPDATE assignment_upload_intents SET state='CONSUMED'; COMMIT;`)).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("0");
  });

  it("최종 기록·파일·소비 의도와 참조된 계정·대상을 변경·삭제하지 못한다", () => {
    makeIntent(); verify(); run(finalizeSql());
    for (const query of ["DELETE FROM assignment_submissions;", "DELETE FROM assignment_submission_files;", "DELETE FROM assignment_upload_intents;",
      "UPDATE assignment_submissions SET submission_key=gen_random_uuid();", "UPDATE assignment_submission_files SET original_name='다름.pdf';",
      `DELETE FROM users WHERE id='${user}';`, `DELETE FROM assignment_targets WHERE id='${target}';`]) expect(() => run(query)).toThrow();
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("1");
  });

  // 두 psql 연결을 실제 잠금 대기시켜 같은키 재시도와 다른키 경합을 각각 검증한다.
  const race = async (sameKey: boolean) => {
    makeIntent(); verify();
    const first = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
    const second = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
    let firstOutput = ""; let secondOutput = ""; let secondError = "";
    first.stdout.on("data", chunk => { firstOutput += String(chunk); });
    second.stdout.on("data", chunk => { secondOutput += String(chunk); });
    second.stderr.on("data", chunk => { secondError += String(chunk); });
    const done = [first, second].map(child => new Promise<number | null>((resolve, reject) => { child.on("close", resolve); child.on("error", reject); }));
    const waitFor = async (query: string) => {
      for (let i = 0; i < 100; i++) { if (run(query) === "1") return; await delay(20); }
      throw new Error("최종 제출 경합 대기 상태를 확인하지 못했습니다.");
    };
    try {
      first.stdin.write(`SET application_name='submission_first'; BEGIN; ${finalizeSql()}\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_first' AND state='idle in transaction';");
      second.stdin.end(`SET application_name='submission_second'; ${finalizeSql(sameKey ? key : key2)}`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_second' AND wait_event_type='Lock';");
      first.stdin.end("COMMIT;\n");
      expect(await done[0]).toBe(0);
      expect(await done[1]).toBe(sameKey ? 0 : 3);
      if (sameKey) expect(secondOutput.trim()).toBe(firstOutput.trim());
      else expect(secondError).toContain("이미 최종 제출한 과제");
      expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("1");
      expect(run("SELECT count(*) FROM assignment_submission_files;")).toBe("1");
    } finally {
      for (const child of [first, second]) { if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n"); if (child.exitCode === null) child.kill(); }
      await Promise.all(done);
    }
  };
  it("동시 같은 키 요청은 동일한 최종 ID로 성공한다", () => race(true), 15000);
  it("동시 다른 키 요청은 하나만 최종화한다", () => race(false), 15000);

  it("기존 컬럼·기본값·제약·인덱스 드리프트는 자동 수정하지 않고 롤백한다", () => {
    for (const [damage, repair] of [
      ["ALTER TABLE assignment_submissions ALTER COLUMN submitted_at DROP DEFAULT;", "ALTER TABLE assignment_submissions ALTER COLUMN submitted_at SET DEFAULT now();"],
      ["ALTER TABLE assignment_submission_files ADD CONSTRAINT unexpected_file_check CHECK (size_bytes<100);", "ALTER TABLE assignment_submission_files DROP CONSTRAINT unexpected_file_check;"],
      ["CREATE INDEX unexpected_intent_idx ON assignment_upload_intents(user_id);", "DROP INDEX unexpected_intent_idx;"],
      ["ALTER TABLE assignment_upload_intents ENABLE ROW LEVEL SECURITY;", "ALTER TABLE assignment_upload_intents DISABLE ROW LEVEL SECURITY;"],
    ]) {
      run(damage);
      try { expect(() => run(migration)).toThrow(); } finally { run(repair); }
      run(migration);
    }
  });

  it("부분 생성 상태가 다른 구조이면 나머지 신규 테이블 생성과 enum도 전체 롤백한다", () => {
    run(`DROP TABLE assignment_submission_files,assignment_submissions,assignment_upload_intents; DROP TYPE assignment_upload_state;
      CREATE TABLE assignment_upload_intents(id uuid PRIMARY KEY);`);
    try {
      expect(() => run(migration)).toThrow();
      expect(run("SELECT to_regclass('assignment_submissions') IS NULL AND to_regclass('assignment_submission_files') IS NULL AND to_regtype('assignment_upload_state') IS NULL;")).toBe("t");
      expect(run("SELECT count(*) FROM information_schema.columns WHERE table_name='assignment_upload_intents';")).toBe("1");
    } finally { run("DROP TABLE assignment_upload_intents;"); run(migration); }
  });
});
