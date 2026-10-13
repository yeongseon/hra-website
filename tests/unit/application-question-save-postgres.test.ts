// @vitest-environment node
/**
 * #96 지원서 질문 저장 함수의 실제 PostgreSQL 회귀 테스트.
 * 임시 클러스터만 사용하며 운영 DATABASE_URL과 .env를 읽지 않는다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bin = process.env.HRA_TEST_PG_BIN;
const formId = "11111111-1111-4111-8111-111111111111";
const questionId = "22222222-2222-4222-8222-222222222222";

describe.skipIf(!bin)("지원서 질문 저장 원자성", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  const request = (title: string, options: string[]) => JSON.stringify([{
    id: questionId,
    title,
    description: null,
    type: "MULTIPLE_CHOICE",
    isRequired: true,
    order: 0,
    options: options.map((value, order) => ({ value, order })),
  }]).replaceAll("'", "''");
  const save = (title: string, options: string[], revision = 0) =>
    `SELECT revision, question_ids FROM save_application_form_questions('${formId}', ${revision}, '${request(title, options)}'::jsonb);`;
  const readSnapshot = () => run(`SELECT questions.title || ':' || string_agg(options.value, ',' ORDER BY options."order")
    FROM application_questions AS questions
    JOIN application_question_options AS options ON options.question_id = questions.id
    WHERE questions.form_id = '${formId}'
    GROUP BY questions.title;`);
  const reset = () => run(`TRUNCATE application_answers, application_submissions,
    application_question_options, application_questions, application_forms;
    INSERT INTO application_forms (id) VALUES ('${formId}');
    INSERT INTO application_questions (id, form_id, title, type, is_required, "order")
      VALUES ('${questionId}', '${formId}', '기존 질문', 'MULTIPLE_CHOICE', true, 0);
    INSERT INTO application_question_options (question_id, value, "order")
      VALUES ('${questionId}', '기존 1', 0), ('${questionId}', '기존 2', 1);`);

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-question-save-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55440`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55440", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TYPE application_question_type AS ENUM
        ('SHORT_ANSWER', 'LONG_ANSWER', 'MULTIPLE_CHOICE', 'CHECKBOX', 'DROPDOWN');
      CREATE TABLE application_forms (
        id uuid PRIMARY KEY, questions_revision integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE application_questions (
        id uuid PRIMARY KEY, form_id uuid NOT NULL REFERENCES application_forms ON DELETE CASCADE,
        title text NOT NULL, description text, type application_question_type NOT NULL,
        is_required boolean NOT NULL DEFAULT false, "order" integer NOT NULL DEFAULT 0);
      CREATE TABLE application_question_options (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        question_id uuid NOT NULL REFERENCES application_questions ON DELETE CASCADE,
        value text NOT NULL, "order" integer NOT NULL DEFAULT 0);
      CREATE TABLE application_submissions (
        id uuid PRIMARY KEY, form_id uuid NOT NULL REFERENCES application_forms);
      CREATE TABLE application_answers (
        id uuid PRIMARY KEY, submission_id uuid NOT NULL REFERENCES application_submissions,
        question_id uuid NOT NULL REFERENCES application_questions, value text NOT NULL);
      ALTER TABLE application_question_options ADD CONSTRAINT reject_test_option CHECK (value <> '삽입 실패');`);
    run(readFileSync("scripts/migrate-atomic-application-questions.sql", "utf8"));
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("두 번째 선택지 INSERT가 실패하면 앞선 질문·선택지·버전도 유지한다", () => {
    reset();
    expect(() => run(save("변경 질문", ["새 선택지", "삽입 실패"]))).toThrow();
    expect(readSnapshot()).toBe("기존 질문:기존 1,기존 2");
    expect(run(`SELECT questions_revision FROM application_forms WHERE id = '${formId}';`)).toBe("0");
  });

  it("새 질문 ID를 반환하고 다음 버전으로 다시 저장할 수 있다", () => {
    reset();
    const newQuestion = {
      title: "추가 질문", description: null, type: "DROPDOWN",
      isRequired: false, order: 0, options: [{ value: "추가 선택", order: 0 }],
    };
    const fresh = JSON.stringify([newQuestion]);
    const [revision, rawIds] = run(`SELECT revision, question_ids FROM save_application_form_questions(
      '${formId}', 0, '${fresh}'::jsonb);`).split("|");
    const savedIds = JSON.parse(rawIds) as string[];
    expect(revision).toBe("1");
    expect(savedIds).toEqual([expect.any(String)]);
    expect(readSnapshot()).toBe("추가 질문:추가 선택");
    expect(run(`SELECT revision FROM save_application_form_questions(
      '${formId}', 1, '${JSON.stringify([{ ...newQuestion, id: savedIds[0], title: "재저장 질문" }])}'::jsonb);`)).toBe("2");
    expect(readSnapshot()).toBe("재저장 질문:추가 선택");
  });

  it("저장 중 제출자는 커밋 전 전체 상태를 읽고 커밋 후 새 전체 상태를 읽는다", async () => {
    reset();
    const editor = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let editorError = "";
    editor.stderr.on("data", chunk => { editorError += String(chunk); });
    const done = new Promise<number | null>((resolve, reject) => {
      editor.on("error", reject);
      editor.on("close", resolve);
    });
    editor.stdin.write(`SET application_name = 'hra_question_editor'; BEGIN; ${save("새 질문", ["새 1", "새 2"])}\n`);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_question_editor' AND state = 'idle in transaction';") === "1") {
          ready = true;
          break;
        }
        await delay(20);
      }
      expect(ready, editorError).toBe(true);
      expect(readSnapshot()).toBe("기존 질문:기존 1,기존 2");
      // 제출이 먼저 읽은 기존 선택지를 보관하되, 쓰기는 양식 잠금 해제까지 기다린다.
      const submitter = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
      let submitError = "";
      submitter.stderr.on("data", chunk => { submitError += String(chunk); });
      const submitted = new Promise<number | null>((resolve, reject) => {
        submitter.on("error", reject);
        submitter.on("close", resolve);
      });
      submitter.stdin.end(`SET application_name = 'hra_question_submit';
        INSERT INTO application_submissions VALUES ('33333333-3333-4333-8333-333333333333', '${formId}');
        INSERT INTO application_answers VALUES
          ('44444444-4444-4444-8444-444444444444',
           '33333333-3333-4333-8333-333333333333', '${questionId}', '기존 1');`);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_question_submit' AND wait_event_type = 'Lock';") === "1") {
          waiting = true;
          break;
        }
        await delay(20);
      }
      expect(waiting, submitError).toBe(true);
      editor.stdin.end("COMMIT;\n");
      expect(await done).toBe(0);
      expect(await submitted, submitError).toBe(0);
      expect(readSnapshot()).toBe("새 질문:새 1,새 2");
      expect(run("SELECT value FROM application_answers;")).toBe("기존 1");
    } finally {
      if (!editor.stdin.writableEnded) editor.stdin.end("ROLLBACK;\n");
      if (editor.exitCode === null) {
        editor.kill();
        await done;
      }
    }
  }, 15000);

  it("두 관리자 중 늦게 확정되는 저장은 버전 충돌로 거부한다", async () => {
    reset();
    const first = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let firstError = "";
    first.stderr.on("data", chunk => { firstError += String(chunk); });
    const firstDone = new Promise<number | null>((resolve, reject) => {
      first.on("error", reject);
      first.on("close", resolve);
    });
    first.stdin.write(`SET application_name = 'hra_first_editor'; BEGIN; ${save("관리자 1", ["선택 1"])}\n`);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_first_editor' AND state = 'idle in transaction';") === "1") {
          ready = true;
          break;
        }
        await delay(20);
      }
      expect(ready, firstError).toBe(true);
      const second = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
      let secondError = "";
      second.stderr.on("data", chunk => { secondError += String(chunk); });
      const secondDone = new Promise<number | null>((resolve, reject) => {
        second.on("error", reject);
        second.on("close", resolve);
      });
      second.stdin.end(`SET application_name = 'hra_second_editor'; ${save("관리자 2", ["선택 2"])}`);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_second_editor' AND wait_event_type = 'Lock';") === "1") {
          waiting = true;
          break;
        }
        await delay(20);
      }
      expect(waiting, secondError).toBe(true);
      first.stdin.end("COMMIT;\n");
      expect(await firstDone).toBe(0);
      expect(await secondDone).not.toBe(0);
      expect(secondError).toContain("application_form_questions_stale");
      expect(readSnapshot()).toBe("관리자 1:선택 1");
      expect(run(`SELECT questions_revision FROM application_forms WHERE id = '${formId}';`)).toBe("1");
    } finally {
      if (!first.stdin.writableEnded) first.stdin.end("ROLLBACK;\n");
      if (first.exitCode === null) {
        first.kill();
        await firstDone;
      }
    }
  }, 15000);
});
