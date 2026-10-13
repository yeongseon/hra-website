// @vitest-environment node
/**
 * #97 제출 마스터·답변 배치의 실제 PostgreSQL 원자성과 UNIQUE 경합을 검증한다.
 * 운영 DATABASE_URL은 사용하지 않고 임시 로컬 클러스터만 생성한다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bin = process.env.HRA_TEST_PG_BIN;
const formId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";
const firstId = "33333333-3333-4333-8333-333333333333";
const secondId = "44444444-4444-4444-8444-444444444444";

describe.skipIf(!bin)("지원서 제출 PostgreSQL 원자성", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const reset = () => run(`TRUNCATE application_answers, application_submissions;`);
  const master = (id: string) => `INSERT INTO application_submissions
    (id, form_id, applicant_name, applicant_email)
    VALUES ('${id}', '${formId}', '지원자', 'same@example.com');`;
  const answer = (id: string, value: string) => `INSERT INTO application_answers
    (submission_id, question_id, value) VALUES ('${id}', '${questionId}', '${value}');`;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-submission-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55441`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55441", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE application_forms (id uuid PRIMARY KEY);
      CREATE TABLE application_questions (id uuid PRIMARY KEY, form_id uuid NOT NULL REFERENCES application_forms);
      CREATE TABLE application_submissions (
        id uuid PRIMARY KEY, form_id uuid NOT NULL REFERENCES application_forms,
        applicant_name text NOT NULL, applicant_email text NOT NULL,
        CONSTRAINT application_submissions_form_applicant_unique UNIQUE (form_id, applicant_email));
      CREATE TABLE application_answers (
        submission_id uuid NOT NULL REFERENCES application_submissions,
        question_id uuid NOT NULL REFERENCES application_questions,
        value text NOT NULL CHECK (value <> '삽입 실패'));
      INSERT INTO application_forms VALUES ('${formId}');
      INSERT INTO application_questions VALUES ('${questionId}', '${formId}');`);
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("답변 INSERT가 실패하면 마스터도 롤백되어 같은 이메일 재시도가 가능하다", () => {
    reset();
    expect(() => run(`BEGIN; ${master(firstId)} ${answer(firstId, "삽입 실패")} COMMIT;`)).toThrow();
    expect(run("SELECT count(*) FROM application_submissions;")).toBe("0");
    expect(run("SELECT count(*) FROM application_answers;")).toBe("0");
    run(`BEGIN; ${master(secondId)} ${answer(secondId, "정상 답변")} COMMIT;`);
    expect(run("SELECT count(*) FROM application_submissions;")).toBe("1");
    expect(run("SELECT value FROM application_answers;")).toBe("정상 답변");
  });

  it("동시 중복 제출은 첫 트랜잭션만 확정하고 답변도 하나만 남긴다", async () => {
    reset();
    const first = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const firstDone = new Promise<number | null>((resolve, reject) => {
      first.on("error", reject);
      first.on("close", resolve);
    });
    first.stdin.write(`SET application_name = 'hra_first_submit'; BEGIN; ${master(firstId)} ${answer(firstId, "첫 답변")}\n`);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_first_submit' AND state = 'idle in transaction';") === "1") {
          ready = true;
          break;
        }
        await delay(20);
      }
      expect(ready).toBe(true);
      const second = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
      let secondError = "";
      second.stderr.on("data", chunk => { secondError += String(chunk); });
      const secondDone = new Promise<number | null>((resolve, reject) => {
        second.on("error", reject);
        second.on("close", resolve);
      });
      second.stdin.end(`SET application_name = 'hra_second_submit'; BEGIN; ${master(secondId)} ${answer(secondId, "둘째 답변")} COMMIT;`);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_second_submit' AND wait_event_type = 'Lock';") === "1") {
          waiting = true;
          break;
        }
        await delay(20);
      }
      expect(waiting, secondError).toBe(true);
      first.stdin.end("COMMIT;\n");
      expect(await firstDone).toBe(0);
      expect(await secondDone).not.toBe(0);
      expect(secondError).toContain("application_submissions_form_applicant_unique");
      expect(run("SELECT count(*) FROM application_submissions;")).toBe("1");
      expect(run("SELECT value FROM application_answers;")).toBe("첫 답변");
    } finally {
      if (!first.stdin.writableEnded) first.stdin.end("ROLLBACK;\n");
      if (first.exitCode === null) {
        first.kill();
        await firstDone;
      }
    }
  }, 15000);
});
