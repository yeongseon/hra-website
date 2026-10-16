// @vitest-environment node
/**
 * 학생 조회 서비스가 실제로 생성한 Drizzle SQL을 격리 PostgreSQL에 실행한다.
 * 인증 세션과 Neon HTTP 전송만 대체하며 조인·필터·페이지네이션·DTO 매핑은 운영 코드를 그대로 사용한다.
 * 운영 .env·DB URL·Blob 저장소를 읽거나 접속하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), query: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@neondatabase/serverless", async importOriginal => {
  const actual = await importOriginal<typeof import("@neondatabase/serverless")>();
  return { ...actual, neon: () => Object.assign(mocks.query, { query: mocks.query }) };
});
vi.mock("@/lib/db", async () => {
  const { drizzle } = await import("drizzle-orm/neon-http");
  const { neon } = await import("@neondatabase/serverless");
  // 전송 함수가 테스트용이므로 이 주소로 네트워크 연결은 발생하지 않는다.
  return { db: drizzle(neon("postgresql://fixture@localhost/isolated_test")) };
});
import { canViewAssignment, requireAssignmentTarget } from "@/lib/academic-permissions";
import { getMyAssignment, getMyAssignments } from "@/features/academics/student-assignments/queries";
import { getMyAcademicUiContext } from "@/features/academics/student-assignments/ui-queries";

const bin = process.env.HRA_TEST_PG_BIN;
const uid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const aid = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const cid = (n: number) => `30000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sid = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const memberA = uid(1), memberB = uid(2), memberC = uid(3), admin = uid(4), faculty = uid(5), pending = uid(6), unlinked = uid(7), ended = uid(8);
const visibleA = aid(1), closedA = aid(2), draftA = aid(3), futureA = aid(4), visibleB = aid(5);

// psql CSV를 Neon arrayMode 결과로 변환한다. 인용문 내부 쉼표·개행과 NULL을 구분한다.
function parseCsv(source: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [], value = "", quoted = false, wasQuoted = false;
  const pushValue = () => { row.push(value === "" && !wasQuoted ? null : value); value = ""; wasQuoted = false; };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value === "") { quoted = true; wasQuoted = true; }
    else if (char === ",") pushValue();
    else if (char === "\n") { pushValue(); rows.push(row); row = []; }
    else if (char !== "\r") value += char;
  }
  if (row.length || value || wasQuoted) { pushValue(); rows.push(row); }
  return rows;
}

// PREPARE 인수만 안전한 SQL 리터럴로 만들고 서비스가 생성한 쿼리 본문은 그대로 실행한다.
function literal(value: unknown): string {
  if (value === null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error("테스트 SQL 인수는 문자열·유한 숫자·NULL만 허용합니다.");
}

describe.skipIf(!bin)("학생 본인 과제 서비스의 격리 PostgreSQL 권한 검증", () => {
  let root: string;
  let started = false;
  let args: string[];
  let targetA: string, targetC: string, fileA: string, fileC: string;
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), [...args, "-Atq"], { input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  const session = (id: string, role: string) => mocks.auth.mockResolvedValue({ user: { id, role } });

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-academic-student-queries-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55455`, "-w", "start"], { stdio: "pipe" });
    started = true;
    args = ["-X", "-h", root, "-p", "55455", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1"];
    run(`CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY,role text NOT NULL,cohort_id uuid);
      CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid REFERENCES schedule_events(id));
      INSERT INTO cohorts VALUES('${cid(1)}'),('${cid(2)}');
      INSERT INTO users VALUES('${memberA}','MEMBER','${cid(2)}'),('${memberB}','MEMBER','${cid(1)}'),('${memberC}','MEMBER','${cid(1)}'),
        ('${admin}','ADMIN',NULL),('${faculty}','FACULTY',NULL),('${pending}','PENDING',NULL),('${unlinked}','MEMBER',NULL),('${ended}','MEMBER',NULL);`);
    for (const file of ["academic-students", "academic-assignments", "academic-submissions"]) run(readFileSync(`scripts/migrate-${file}.sql`, "utf8"));
    // ADMIN/FACULTY/PENDING에도 의도적으로 명부를 연결하여 역할 gate가 실제 경계인지 검증한다.
    for (let n = 1; n <= 8; n++) run(`INSERT INTO academic_students(id,user_id,display_name) VALUES('${sid(n)}',${n === 7 ? "NULL" : `'${uid(n)}'`},'시험 학생 ${n}');
      INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${sid(n)}','${cid(n === 2 ? 2 : 1)}');`);
    for (let n = 1; n <= 5; n++) run(`INSERT INTO assignments(id,cohort_id,title,instructions,due_at,created_by_user_id)
      VALUES('${aid(n)}','${cid(n === 5 ? 2 : 1)}','시험 과제 ${n}','쉼표, 한글 안내',clock_timestamp()+interval '${n + 1} days','${admin}');`);
    for (const id of [visibleA, closedA, futureA, visibleB]) run(`SELECT publish_academic_assignment('${id}','${admin}');`);
    run(`UPDATE assignments SET status='CLOSED' WHERE id='${closedA}';
      UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE student_id='${sid(8)}';
      BEGIN; ALTER TABLE assignments DISABLE TRIGGER USER; ALTER TABLE assignment_targets DISABLE TRIGGER USER;
      UPDATE assignments SET published_at=clock_timestamp()+interval '1 day' WHERE id='${futureA}';
      UPDATE assignment_targets SET assigned_at=(SELECT published_at FROM assignments WHERE id='${futureA}') WHERE assignment_id='${futureA}';
      ALTER TABLE assignments ENABLE TRIGGER USER; ALTER TABLE assignment_targets ENABLE TRIGGER USER; COMMIT;`);
    const target = (studentId: string) => run(`SELECT t.id FROM assignment_targets t JOIN cohort_enrollments e ON e.id=t.enrollment_id
      WHERE t.assignment_id='${visibleA}' AND e.student_id='${studentId}';`);
    targetA = target(sid(1)); targetC = target(sid(3));
    for (const [owner, ownTarget, name] of [[memberA, targetA, "내과제.pdf"], [memberC, targetC, "다른학생.pdf"]]) {
      const intentId = run(`INSERT INTO assignment_upload_intents(assignment_target_id,user_id,storage_key,expires_at)
        VALUES('${ownTarget}','${owner}','assignments/private/${owner}.pdf',clock_timestamp()+interval '1 hour') RETURNING id;`);
      run(`SELECT verify_academic_assignment_upload('${intentId}','${owner}','${name}','application/pdf',2048,'${"a".repeat(64)}');
        SELECT finalize_academic_assignment_submission('${ownTarget}','${owner}','${intentId}',gen_random_uuid());`);
    }
    const file = (ownTarget: string) => run(`SELECT f.id FROM assignment_submission_files f JOIN assignment_submissions s ON s.id=f.submission_id WHERE s.assignment_target_id='${ownTarget}';`);
    fileA = file(targetA); fileC = file(targetC);
    // Neon HTTP 배열 결과를 실제 DB PREPARE/EXECUTE로 전달한다. 실제 SQL은 SELECT만 허용한다.
    mocks.query.mockImplementation(async (query: string, params: unknown[], options: { arrayMode: boolean }) => {
      if (!/^select /i.test(query)) throw new Error("학생 조회 테스트에서는 SELECT만 허용합니다.");
      if (!options.arrayMode) {
        const result = run(`PREPARE academic_read AS SELECT COALESCE(json_agg(row_to_json(r)),'[]') FROM (${query}) r; EXECUTE academic_read(${params.map(literal).join(",")});`);
        return { rows: JSON.parse(result) };
      }
      const output = execFileSync(program("psql"), [...args, "-tq", "--csv"], { input: `PREPARE academic_read AS ${query}; EXECUTE academic_read(${params.map(literal).join(",")});`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
      return { rows: parseCsv(output) };
    });
  }, 30000);

  beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("ACADEMIC_ENABLED", "true"); session(memberA, "MEMBER"); });
  afterAll(() => {
    vi.unstubAllEnvs();
    try { if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" }); }
    finally { if (root) rmSync(root, { recursive: true, force: true }); }
  });

  it.each([[admin, "ADMIN"], [faculty, "FACULTY"], [pending, "PENDING"], [null, null]])("%s/%s는 실제 학적이 있어도 DB 전에 학생 조회를 거부한다", async (id, role) => {
    if (id && role) session(id, role); else mocks.auth.mockResolvedValue(null);
    await expect(getMyAssignments()).rejects.toMatchObject({ code: role ? "FORBIDDEN" : "UNAUTHENTICATED" });
    await expect(getMyAssignment(visibleA)).rejects.toMatchObject({ code: role ? "FORBIDDEN" : "UNAUTHENTICATED" });
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("회원 기수 필드를 신뢰하지 않고 학적 A/B의 공개·종료 과제만 조회한다", async () => {
    expect((await getMyAssignments()).items.map(item => item.assignmentId)).toEqual([visibleA, closedA]);
    expect(await canViewAssignment(visibleA)).toBe(true);
    for (const id of [draftA, futureA, visibleB, aid(99)]) expect(await canViewAssignment(id)).toBe(false);
    session(memberB, "MEMBER");
    expect((await getMyAssignments()).items.map(item => item.assignmentId)).toEqual([visibleB]);
    expect(await canViewAssignment(visibleA)).toBe(false);
  });

  it.each(["ADMIN", "FACULTY", "PENDING"])("인증 직후 %s 역할로 바뀌면 같은 요청의 실제 SQL도 과제·파일을 숨긴다", async role => {
    mocks.auth.mockImplementationOnce(async () => {
      run(`UPDATE users SET role='${role}' WHERE id='${memberA}';`);
      return { user: { id: memberA, role: "MEMBER" } };
    });
    try {
      expect((await getMyAssignments()).items).toEqual([]);
      await expect(getMyAssignment(visibleA)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
      await expect(requireAssignmentTarget({ targetId: targetA })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    } finally {
      run(`UPDATE users SET role='MEMBER' WHERE id='${memberA}';`);
    }
  });

  it("같은 기수 다른 학생의 대상·최종 파일은 직접 ID를 추측해도 조회하지 못한다", async () => {
    await expect(requireAssignmentTarget({ targetId: targetC })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    expect((await requireAssignmentTarget({ targetId: targetA })).targetId).toBe(targetA);
    const detail = await getMyAssignment(visibleA);
    expect(detail.instructions).toBe("쉼표, 한글 안내");
    expect(detail.file).toEqual({ fileId: fileA, originalName: "내과제.pdf", mimeType: "application/pdf", sizeBytes: 2048 });
    const json = JSON.stringify(detail);
    expect(json).not.toContain(fileC); expect(json).not.toContain("다른학생.pdf"); expect(json).not.toContain("assignments/private");
    expect(json).not.toContain("storageKey"); expect(json).not.toContain("checksum"); expect(json).not.toContain("submissionKey");
    session(memberC, "MEMBER");
    expect((await getMyAssignment(visibleA)).file?.fileId).toBe(fileC);
    await expect(requireAssignmentTarget({ targetId: targetA })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it.each([unlinked, ended])("미연결 또는 종료 학적 계정 %s는 대상 스냅샷이 있어도 조회하지 못한다", async id => {
    session(id, "MEMBER");
    expect((await getMyAssignments()).items).toEqual([]);
    await expect(getMyAssignment(visibleA)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("공개 후 새로 등록된 학생은 기존 과제 대상에 자동 포함되지 않는다", async () => {
    const newUser = uid(9);
    run(`INSERT INTO users VALUES('${newUser}','MEMBER','${cid(1)}'); INSERT INTO academic_students(id,user_id,display_name)
      VALUES('${sid(9)}','${newUser}','나중 등록'); INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${sid(9)}','${cid(1)}');`);
    session(newUser, "MEMBER");
    expect((await getMyAssignments()).items).toEqual([]);
    await expect(getMyAssignment(visibleA)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("페이지네이션은 안정된 정렬로 한 건씩 반환하고 다음 페이지 유무를 판별한다", async () => {
    const first = await getMyAssignments({ page: 1, pageSize: 1 });
    const second = await getMyAssignments({ page: 2, pageSize: 1 });
    const empty = await getMyAssignments({ page: 3, pageSize: 1 });
    expect(first.items.map(item => item.assignmentId)).toEqual([visibleA]); expect(first.hasNextPage).toBe(true);
    expect(second.items.map(item => item.assignmentId)).toEqual([closedA]); expect(second.hasNextPage).toBe(false);
    expect(empty.items).toEqual([]); expect(empty.hasNextPage).toBe(false);
    expect((await getMyAssignment(closedA)).submission).toBeNull();
  });

  it("화면 안내 helper는 본인 학적 유무와 실제 DB 현재 시각만 반환한다", async () => {
    const before = Date.parse(run("SELECT clock_timestamp();"));
    const context = await getMyAcademicUiContext();
    const after = Date.parse(run("SELECT clock_timestamp();"));
    expect(context.hasActiveEnrollment).toBe(true);
    expect(Date.parse(context.serverNow)).toBeGreaterThanOrEqual(before);
    expect(Date.parse(context.serverNow)).toBeLessThanOrEqual(after);
    expect(Object.keys(context)).toEqual(["serverNow", "hasActiveEnrollment"]);
    for (const id of [unlinked, ended]) { session(id, "MEMBER"); expect((await getMyAcademicUiContext()).hasActiveEnrollment).toBe(false); }
  });

  it("자기 최종 제출 ID를 파일 API 연결용으로만 반환하고 타인 최종 ID는 노출하지 않는다", async () => {
    const ownId = run(`SELECT id FROM assignment_submissions WHERE assignment_target_id='${targetA}';`);
    const otherId = run(`SELECT id FROM assignment_submissions WHERE assignment_target_id='${targetC}';`);
    const detail = await getMyAssignment(visibleA);
    expect(detail.submission?.submissionId).toBe(ownId);
    expect(JSON.stringify(detail)).not.toContain(otherId);
  });

  it("비활성 gate는 실제 SQL 실행 전 닫힌다", async () => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    await expect(getMyAssignments()).rejects.toMatchObject({ code: "DISABLED", status: 404 });
    await expect(getMyAssignment(visibleA)).rejects.toMatchObject({ code: "DISABLED", status: 404 });
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
