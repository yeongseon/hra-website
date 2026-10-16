// @vitest-environment node
/** 서비스 생성 SQL을 실제 격리 PostgreSQL에 실행해 스냅샷 분모·필터·동시 제출을 검증한다. */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));
import { listAssignmentSubmissionStatuses, exportAssignmentSubmissionStatuses } from "@/features/academics/submission-statuses/queries";

const bin = process.env.HRA_TEST_PG_BIN;
const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const aid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const approver = uid(9);
const literal = (value: unknown) => {
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value === null) return "NULL";
  throw new Error("허용되지 않는 격리 SQL 인수입니다.");
};

describe.skipIf(!bin)("과제 제출 현황의 실제 PostgreSQL snapshot", () => {
  let root: string; let started = false; let args: string[]; let pauseRead = false; let revokeBeforeRead = false;
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), args, { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const ownTarget = (assignment: string, student: string) => run(`SELECT t.id FROM assignment_targets t JOIN cohort_enrollments e ON e.id=t.enrollment_id WHERE t.assignment_id='${assignment}' AND e.student_id='${student}';`);
  const submit = (assignment: string, n: number) => {
    const target = ownTarget(assignment, sid(n));
    const intent = run(`INSERT INTO assignment_upload_intents(assignment_target_id,user_id,storage_key,expires_at)
      VALUES('${target}','${uid(n)}','assignments/${assignment}/${n}.pdf',clock_timestamp()+interval '1 hour') RETURNING id;`);
    run(`SELECT verify_academic_assignment_upload('${intent}','${uid(n)}','시험.pdf','application/pdf',1024,'${"a".repeat(64)}');
      SELECT finalize_academic_assignment_submission('${target}','${uid(n)}','${intent}',gen_random_uuid());`);
  };

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-submission-statuses-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55458`, "-w", "start"], { stdio: "pipe" });
    started = true;
    args = ["-X", "-h", root, "-p", "55458", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL DEFAULT 'MEMBER'); CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));
      INSERT INTO cohorts VALUES('${cid(1)}'),('${cid(2)}'),('${cid(3)}'); INSERT INTO users(id,role) VALUES('${approver}','ADMIN');`);
    for (let n = 1; n <= 6; n++) run(`INSERT INTO users(id) VALUES('${uid(n)}');`);
    for (const file of ["academic-students", "academic-assignments", "academic-submissions"]) run(readFileSync(`scripts/migrate-${file}.sql`, "utf8"));
    for (let n = 1; n <= 5; n++) run(`INSERT INTO academic_students(id,user_id,display_name)
      VALUES('${sid(n)}',${n === 2 ? "NULL" : `'${uid(n)}'`},'${n < 3 ? "동일 이름" : `학생 ${n}`}');
      INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${sid(n)}','${cid(n > 3 ? 2 : 1)}');`);
    // 부분 제출·전원 미제출·전원 제출·대상 없음·동시 제출용 과제를 각각 공개한다.
    for (let n = 1; n <= 5; n++) run(`INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)
      VALUES('${aid(n)}','${cid(n === 3 ? 2 : n === 4 ? 3 : 1)}','시험 과제 ${n}',clock_timestamp()+interval '1 day','${approver}');
      SELECT publish_academic_assignment('${aid(n)}','${approver}');`);
    submit(aid(1), 1); submit(aid(3), 4); submit(aid(3), 5);
    run(`UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE student_id='${sid(3)}';
      INSERT INTO academic_students(id,user_id,display_name) VALUES('${sid(6)}','${uid(6)}','공개 후 신규');
      INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${sid(6)}','${cid(1)}');`);
    mocks.execute.mockImplementation(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      if (revokeBeforeRead) { revokeBeforeRead = false; run(`UPDATE users SET role='PENDING' WHERE id='${approver}';`); }
      const compiled = new PgDialect().sqlToQuery(query);
      const body = pauseRead
        ? `WITH barrier AS MATERIALIZED (SELECT pg_sleep(0.8)) SELECT row_to_json(snapshot) FROM barrier CROSS JOIN LATERAL (${compiled.sql}) snapshot`
        : `SELECT row_to_json(snapshot) FROM (${compiled.sql}) snapshot`;
      const input = `SET application_name='submission_status_snapshot'; PREPARE status_query AS ${body}; EXECUTE status_query(${compiled.params.map(literal).join(",")});`;
      if (!pauseRead) return { rows: [JSON.parse(run(input))] };
      return await new Promise((resolve, reject) => {
        const child = spawn(program("psql"), args, { stdio: ["pipe", "pipe", "pipe"] });
        let output = "", error = "";
        child.stdout.on("data", chunk => { output += String(chunk); }); child.stderr.on("data", chunk => { error += String(chunk); });
        child.on("error", reject); child.on("close", code => { if (code !== 0) reject(new Error(error)); else resolve({ rows: [JSON.parse(output.trim())] }); });
        child.stdin.end(input);
      });
    });
  }, 30000);
  beforeEach(() => { vi.clearAllMocks(); pauseRead = false; vi.stubEnv("ACADEMIC_ENABLED", "true"); vi.stubEnv("ACADEMIC_APPROVER_USER_ID", approver); mocks.auth.mockResolvedValue({ user: { id: approver, role: "ADMIN" } }); });
  afterAll(() => { vi.unstubAllEnvs(); try { if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" }); } finally { if (root) rmSync(root, { recursive: true, force: true }); } });

  it.each([[1, 3, 1], [2, 3, 0], [3, 2, 2], [4, 0, 0]])("과제 %i는 N=%i S=%i와 N=S+미제출을 유지한다", async (n, total, submitted) => {
    const result = await listAssignmentSubmissionStatuses({ assignmentId: aid(n) });
    expect(result.counts).toEqual({ total, submitted, unsubmitted: total - submitted }); expect(result.rows).toHaveLength(total);
  });
  it("미로그인·미연결·종료 학적도 분모에 남고 공개 후 등록은 기존 대상에 추가되지 않는다", async () => {
    const result = await listAssignmentSubmissionStatuses({ assignmentId: aid(1) });
    expect(result.counts.total).toBe(3); expect(result.rows.filter(row => !row.accountLinked)).toHaveLength(1);
    expect(result.rows.filter(row => !row.enrollmentActive)).toHaveLength(1);
    expect(result.rows.every(row => row.displayName !== "공개 후 신규")).toBe(true);
  });
  it("기수 정확 일치와 제출 필터·검색은 전체 집계를 바꾸지 않는다", async () => {
    await expect(listAssignmentSubmissionStatuses({ assignmentId: aid(1), cohortId: cid(2) })).rejects.toMatchObject({ status: 404 });
    const result = await listAssignmentSubmissionStatuses({ assignmentId: aid(1), cohortId: cid(1), status: "UNSUBMITTED", search: "동일" });
    expect(result.counts).toEqual({ total: 3, submitted: 1, unsubmitted: 2 }); expect(result.filteredCount).toBe(1); expect(result.rows[0].submittedAt).toBeNull();
    expect((await listAssignmentSubmissionStatuses({ assignmentId: aid(1), search: "%" })).rows).toEqual([]);
  });
  it("동명이인과 정렬 방향에서도 ID tie-breaker로 페이지 누락·중복을 막는다", async () => {
    for (const sort of ["name", "submittedAt"]) for (const direction of ["asc", "desc"]) {
      const ids: string[] = [];
      for (let page = 1; page <= 3; page++) ids.push((await listAssignmentSubmissionStatuses({ assignmentId: aid(1), sort, direction, page, pageSize: 1 })).rows[0].targetId);
      expect(new Set(ids).size).toBe(3);
      expect(ids).toEqual((await listAssignmentSubmissionStatuses({ assignmentId: aid(1), sort, direction })).rows.map(row => row.targetId));
    }
    expect((await exportAssignmentSubmissionStatuses({ assignmentId: aid(1), page: 3, pageSize: 1 })).rows).toHaveLength(3);
  });
  it("같은 SQL snapshot 도중 제출이 커밋돼도 카운트와 행은 일치하고 새로고침에 반영된다", async () => {
    pauseRead = true;
    const beforeCommit = listAssignmentSubmissionStatuses({ assignmentId: aid(5) });
    let sleeping = false;
    for (let i = 0; i < 100; i++) {
      if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name='submission_status_snapshot' AND wait_event='PgSleep';") === "1") { sleeping = true; break; }
      await delay(10);
    }
    if (!sleeping) throw new Error("현황 SQL snapshot의 동시 제출 대기 상태를 확인하지 못했습니다.");
    submit(aid(5), 1);
    const before = await beforeCommit;
    expect(before.counts).toEqual({ total: 3, submitted: 0, unsubmitted: 3 }); expect(before.rows.every(row => row.submittedAt === null)).toBe(true);
    pauseRead = false;
    const after = await listAssignmentSubmissionStatuses({ assignmentId: aid(5) });
    expect(after.counts).toEqual({ total: 3, submitted: 1, unsubmitted: 2 }); expect(after.rows.filter(row => row.submittedAt !== null)).toHaveLength(1);
  });
  it("auth 통과 후 SQL 실행 전 역할 철회는 목록·내보내기를 빈 성공 대신403으로 거부한다", async () => {
    try {
      revokeBeforeRead = true;
      await expect(listAssignmentSubmissionStatuses({ assignmentId: aid(1) })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
      run(`UPDATE users SET role='ADMIN' WHERE id='${approver}';`);
      revokeBeforeRead = true;
      await expect(exportAssignmentSubmissionStatuses({ assignmentId: aid(1) })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    } finally { revokeBeforeRead = false; run(`UPDATE users SET role='ADMIN' WHERE id='${approver}';`); }
  });
  it.each(["ADMIN", "MEMBER", "FACULTY", "PENDING"])("일반 %s는 실제 현황 DB를 읽기 전에 차단한다", async role => {
    mocks.auth.mockResolvedValue({ user: { id: uid(1), role } });
    await expect(listAssignmentSubmissionStatuses({ assignmentId: aid(1) })).rejects.toMatchObject({ status: 403 }); expect(mocks.execute).not.toHaveBeenCalled();
  });
});
