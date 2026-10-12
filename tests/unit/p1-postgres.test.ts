// @vitest-environment node
/**
 * P1 수정의 실제 PostgreSQL 회귀 테스트 (#89, #91).
 * HRA_TEST_PG_BIN에 로컬 PostgreSQL bin 경로를 지정하면 임시 클러스터를 생성합니다.
 * 기존 DATABASE_URL/.env는 읽지 않으며, 임시 유닉스 소켓만 사용하고 종료 시 정리합니다.
 * 실제 인가 SQL·배포용 마이그레이션·두 연결 간 FK 잠금 경합을 검증합니다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { classMaterialReadFilter } from "@/features/class-materials/access";

const bin = process.env.HRA_TEST_PG_BIN;
const dialect = new PgDialect();

describe.skipIf(!bin)("격리된 PostgreSQL P1 회귀", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (sql: string) => execFileSync(program("psql"), psqlArgs, {
    input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-p1-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55439`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55439", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    // 실제 스키마의 연쇄 삭제 구조를 최소 fixture로 재현합니다. 시작 FK는 수정 전 CASCADE입니다.
    run(`
      CREATE TABLE cohorts (id uuid PRIMARY KEY);
      CREATE TABLE application_forms (id uuid PRIMARY KEY, cohort_id uuid REFERENCES cohorts ON DELETE CASCADE);
      CREATE TABLE application_questions (id uuid PRIMARY KEY, form_id uuid REFERENCES application_forms ON DELETE CASCADE);
      CREATE TABLE application_question_options (id uuid PRIMARY KEY, question_id uuid REFERENCES application_questions ON DELETE CASCADE);
      CREATE TABLE application_submissions (id uuid PRIMARY KEY, form_id uuid REFERENCES application_forms ON DELETE CASCADE);
      CREATE TABLE application_answers (id uuid PRIMARY KEY,
        submission_id uuid REFERENCES application_submissions ON DELETE CASCADE,
        question_id uuid NOT NULL REFERENCES application_questions ON DELETE CASCADE, value text NOT NULL);
      CREATE TABLE class_materials (id int PRIMARY KEY, audience text NOT NULL);
      INSERT INTO class_materials VALUES (1, 'STUDENT'), (2, 'FACULTY'), (3, 'UNKNOWN');
    `);
    const migration = readFileSync("scripts/migrate-protect-application-answers.sql", "utf8");
    run(migration);
    run(migration);
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ["MEMBER", "1"], ["FACULTY", "1\n2"], ["ADMIN", "1\n2"],
    ["PENDING", ""], ["UNKNOWN", ""], [undefined, ""],
  ])("실제 인가 SQL로 %s 자료 범위를 제한", (role, expected) => {
    const query = dialect.sqlToQuery(classMaterialReadFilter({ id: "member", role }));
    // 파라미터는 정책 상수만 사용하며, SQL 실행 자체는 실제 서버에서 검증합니다.
    const args = query.params.map((p) => `'${String(p).replaceAll("'", "''")}'`).join(",");
    expect(run(`PREPARE access AS SELECT id FROM class_materials WHERE ${query.sql} ORDER BY id;
      EXECUTE access${args ? `(${args})` : ""};`)).toBe(expected);
  });

  const formId = "11111111-1111-4111-8111-111111111111";
  const questionId = "22222222-2222-4222-8222-222222222222";
  const submissionId = "33333333-3333-4333-8333-333333333333";
  const answerId = "44444444-4444-4444-8444-444444444444";
  const reset = () => run(`TRUNCATE cohorts, application_forms, application_questions, application_question_options, application_submissions, application_answers;
    INSERT INTO cohorts VALUES ('${formId}');
    INSERT INTO application_forms VALUES ('${formId}', '${formId}');
    INSERT INTO application_questions VALUES ('${questionId}', '${formId}');
    INSERT INTO application_question_options VALUES ('${answerId}', '${questionId}');
    INSERT INTO application_submissions VALUES ('${submissionId}', '${formId}');`);
  const insertAnswer = `INSERT INTO application_answers VALUES ('${answerId}', '${submissionId}', '${questionId}', '테스트 답변');`;

  it("마이그레이션 재실행 후 답변 FK는 NO ACTION", () => {
    expect(run("SELECT confdeltype FROM pg_constraint WHERE conname = 'application_answers_question_id_application_questions_id_fk';")).toBe("a");
    expect(run("SELECT condeferrable AND condeferred FROM pg_constraint WHERE conname = 'application_answers_question_id_application_questions_id_fk';")).toBe("t");
  });

  it("답변 없는 질문 삭제 시 선택지는 정상 정리", () => {
    reset();
    run(`DELETE FROM application_questions WHERE id = '${questionId}';`);
    expect(run("SELECT count(*) FROM application_question_options;")).toBe("0");
  });

  it.each(["application_forms", "application_submissions", "cohorts"])("%s 전체 삭제는 답변까지 정상 정리", (table) => {
    reset();
    run(insertAnswer);
    run(`DELETE FROM ${table};`);
    expect(run("SELECT count(*) FROM application_answers;")).toBe("0");
  });

  it("사전 검사 후 다른 연결에서 제출한 답변은 질문 삭제로 유실되지 않음", () => {
    reset();
    expect(run("SELECT count(*) FROM application_answers;")).toBe("0");
    run(insertAnswer);
    expect(() => run(`DELETE FROM application_questions WHERE id = '${questionId}';`)).toThrow();
    expect(run("SELECT count(*) FROM application_answers;")).toBe("1");
  });

  it("미커밋 답변 INSERT와 DELETE가 경합하면 DELETE는 대기 후 실패", async () => {
    reset();
    const submit = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let stderr = "";
    submit.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const done = new Promise<number | null>((resolve, reject) => {
      submit.on("error", reject);
      submit.on("close", resolve);
    });
    submit.stdin.write(`SET application_name = 'hra_p1_submit'; BEGIN; ${insertAnswer} SET CONSTRAINTS ALL IMMEDIATE;\n`);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_p1_submit' AND state = 'idle in transaction';") === "1") {
          ready = true;
          break;
        }
        await delay(20);
      }
      expect(ready).toBe(true);
      // 미커밋 답변의 행 잠금 때문에 질문 삭제가 대기하는지 확인합니다.
      expect(() => run(`SET lock_timeout = '200ms'; DELETE FROM application_questions WHERE id = '${questionId}';`)).toThrow();
      submit.stdin.end("COMMIT;\n");
      expect(await done, stderr).toBe(0);
      expect(() => run(`DELETE FROM application_questions WHERE id = '${questionId}';`)).toThrow();
      expect(run("SELECT count(*) FROM application_answers;")).toBe("1");
    } finally {
      if (!submit.stdin.writableEnded) submit.stdin.end("ROLLBACK;\n");
      if (submit.exitCode === null) {
        submit.kill();
        await done;
      }
    }
  }, 15000);

  it("질문 삭제가 먼저 확정되면 늦은 답변의 커밋을 거절", () => {
    reset();
    run(`DELETE FROM application_questions WHERE id = '${questionId}';`);
    expect(() => run(`BEGIN; ${insertAnswer} COMMIT;`)).toThrow();
    expect(run("SELECT count(*) FROM application_answers;")).toBe("0");
  });
});
