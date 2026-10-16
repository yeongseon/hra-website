// @vitest-environment node
/** 파일 교체에서 재사용하는 #151 취소와 #152 최종화의 실제 두 연결 잠금 경합을 검증한다. */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001", cohort = "20000000-0000-4000-8000-000000000001";
const student = "30000000-0000-4000-8000-000000000001", assignment = "40000000-0000-4000-8000-000000000001";

describe.skipIf(!bin)("학생 파일 교체 취소/최종화 PostgreSQL 경합", () => {
  let root: string, args: string[], started = false, target: string;
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), args, { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const issue = (name = "과제.pdf") => run(`SELECT issue_academic_assignment_upload('${randomUUID()}','${target}','${actor}','${name}',5);`);
  const verify = (id: string) => run(`SELECT verify_authorized_academic_upload('${id}','${actor}','${"a".repeat(64)}','qa-etag');`);
  const finalize = (id: string) => `SELECT complete_academic_assignment_submission('${target}','${actor}','${id}','${randomUUID()}',true);`;
  const cancel = (id: string) => `SELECT cancel_academic_assignment_upload('${id}','${actor}','${target}');`;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-student-replacement-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55479`, "-w", "start"], { stdio: "pipe" }); started = true;
    args = ["-X", "-h", root, "-p", "55479", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL); CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id)); CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));
      INSERT INTO users VALUES('${actor}','MEMBER'); INSERT INTO cohorts VALUES('${cohort}');`);
    for (const name of ["academic-students", "academic-assignments", "academic-submissions", "academic-upload-authorizations", "academic-submission-finalization"]) run(readFileSync(`scripts/migrate-${name}.sql`, "utf8"));
  }, 30000);
  beforeEach(() => {
    run(`TRUNCATE academic_upload_authorizations,assignment_submission_files,assignment_submissions,assignment_upload_intents,assignment_targets,assignments,cohort_enrollments,academic_students;
      INSERT INTO academic_students(id,user_id,display_name) VALUES('${student}','${actor}','교체 시험'); INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${student}','${cohort}');
      INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id) VALUES('${assignment}','${cohort}','교체 시험',clock_timestamp()+interval '1 day','${actor}'); SELECT publish_academic_assignment('${assignment}','${actor}');`);
    target = run("SELECT id FROM assignment_targets LIMIT 1;");
  });
  afterAll(() => { try { if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" }); } finally { if (root) rmSync(root, { recursive: true, force: true }); } });

  it("미검증 위장 파일 의도를 취소한 뒤 새 의도만 최종화하고 이전 기록을 삭제하지 않는다", () => {
    const old = issue("위장.pdf"); run(cancel(old));
    const next = issue("정상.pdf"); expect(next).not.toBe(old); verify(next); run(finalize(next));
    expect(run("SELECT count(*) FROM assignment_submissions;")).toBe("1");
    expect(run(`SELECT retired_at IS NOT NULL FROM academic_upload_authorizations WHERE intent_id='${old}';`)).toBe("t");
    expect(run(`SELECT state FROM assignment_upload_intents WHERE id='${old}';`)).toBe("INTENDED");
    expect(run(`SELECT original_name FROM assignment_submission_files;`)).toBe("정상.pdf");
    expect(() => run(finalize(old))).toThrow();
  });

  const race = async (cancelFirst: boolean) => {
    const id = issue(); verify(id);
    const first = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
    const second = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
    let secondError = ""; second.stderr.on("data", chunk => { secondError += String(chunk); });
    const done = [first, second].map(child => new Promise<number | null>((resolve, reject) => { child.on("close", resolve); child.on("error", reject); }));
    const waitFor = async (query: string) => { for (let n = 0; n < 100; n++) { if (run(query) === "1") return; await delay(20); } throw new Error("교체 취소/최종화의 실제 잠금 경합을 확인하지 못했습니다."); };
    try {
      first.stdin.write(`SET application_name='replacement_first'; BEGIN; ${cancelFirst ? cancel(id) : finalize(id)}\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='replacement_first' AND state='idle in transaction';");
      second.stdin.end(`SET application_name='replacement_second'; ${cancelFirst ? finalize(id) : cancel(id)}`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='replacement_second' AND wait_event_type='Lock';");
      first.stdin.end("COMMIT;\n"); expect(await done[0]).toBe(0); expect(await done[1]).toBe(3);
      expect(secondError).toMatch(/upload_conflict|이미 제출/);
      expect(run("SELECT count(*) FROM assignment_submissions;")).toBe(cancelFirst ? "0" : "1");
      expect(run("SELECT count(*) FROM assignment_submission_files;")).toBe(cancelFirst ? "0" : "1");
      if (cancelFirst) expect(issue("교체.pdf")).not.toBe(id);
      else { expect(run(`SELECT state FROM assignment_upload_intents WHERE id='${id}';`)).toBe("CONSUMED"); expect(run(`SELECT retired_at IS NULL FROM academic_upload_authorizations WHERE intent_id='${id}';`)).toBe("t"); }
    } finally { for (const child of [first, second]) { if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n"); if (child.exitCode === null) child.kill(); } await Promise.all(done); }
  };
  it("취소가 먼저 잠그면 최종화는 대기 뒤 거부되고 새 의도가 허용된다", () => race(true), 15000);
  it("최종화가 먼저 잠그면 취소는 대기 뒤 거부되고 확정 파일이 보존된다", () => race(false), 15000);
});
