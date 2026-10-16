// @vitest-environment node
/** 과제 변경·공개 스냅샷·감사 원자성을 실제 격리 PostgreSQL에서 검증합니다. */
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { academicAssignmentEvents } from "@/lib/db/academic-assignment-events";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const otherCohort = "20000000-0000-4000-8000-000000000002";
const event = "30000000-0000-4000-8000-000000000001";
const otherEvent = "30000000-0000-4000-8000-000000000002";
const session = "40000000-0000-4000-8000-000000000001";
const otherSession = "40000000-0000-4000-8000-000000000002";
const student = "50000000-0000-4000-8000-000000000001";
const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const content = () => ({ cohortId: cohort, scheduleEventId: event, scheduleSessionId: session,
  title: "개인정보를 포함할 수도 있는 제목", instructions: "본문 private@example.invalid", dueAt: "2035-12-31T14:59:59.000Z" as string | null });
const mutate = (action: string, payload: unknown, request = randomUUID(), actorId = actor, configuredId = actor) => {
  const literal = `${quote(JSON.stringify(payload))}::jsonb`;
  // 기존 테스트는 실행 직전 공개 미리보기를 만들고 명시된 확인값을 우선합니다.
  const planned = action === "PUBLISH" ? `jsonb_build_object(
    'expectedUpdatedAt',(SELECT updated_at FROM assignments WHERE id=(${literal}->>'assignmentId')::uuid),
    'expectedTargetFingerprint',(SELECT encode(sha256(convert_to(COALESCE(string_agg(e.id::text,',' ORDER BY e.id),''),'UTF8')),'hex')
      FROM cohort_enrollments e JOIN assignments a ON a.cohort_id=e.cohort_id
      WHERE a.id=(${literal}->>'assignmentId')::uuid AND e.status='ENROLLED' AND e.ended_at IS NULL
        AND e.enrolled_at<=clock_timestamp() AND e.created_at<=clock_timestamp())) || ${literal}` : literal;
  return `SELECT public.mutate_academic_assignment('${action}','${actorId}','${configuredId}',
    '${request}','${request}',${planned});`;
};

describe.skipIf(!bin)("과제 액션 PostgreSQL 원자 계약", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const counts = () => run("SELECT jsonb_build_array((SELECT count(*) FROM assignments), (SELECT count(*) FROM assignment_targets), (SELECT count(*) FROM academic_assignment_events));");
  const create = (payload = content()) => JSON.parse(run(mutate("CREATE", payload))).assignment;

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-assignment-actions-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55453`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55453", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE users (id uuid PRIMARY KEY, role text NOT NULL);
      CREATE TABLE cohorts (id uuid PRIMARY KEY);
      CREATE TABLE schedule_events (id uuid PRIMARY KEY, cohort_id uuid REFERENCES cohorts(id));
      CREATE TABLE schedule_sessions (id uuid PRIMARY KEY, schedule_event_id uuid REFERENCES schedule_events(id));
      INSERT INTO users VALUES ('${actor}','FACULTY'),('${other}','ADMIN');
      INSERT INTO cohorts VALUES ('${cohort}'),('${otherCohort}');
      INSERT INTO schedule_events VALUES ('${event}','${cohort}'),('${otherEvent}','${otherCohort}');
      INSERT INTO schedule_sessions VALUES ('${session}','${event}'),('${otherSession}','${otherEvent}');`);
    run(readFileSync("scripts/migrate-academic-students.sql", "utf8"));
    run(readFileSync("scripts/migrate-academic-assignments.sql", "utf8"));
    const migration = readFileSync("scripts/migrate-academic-assignment-actions.sql", "utf8");
    run(migration);
    run(migration);
    run(`INSERT INTO academic_students (id,display_name) VALUES ('${student}','시험 학생');
      INSERT INTO cohort_enrollments (student_id,cohort_id) VALUES ('${student}','${cohort}');`);
  }, 30000);
  beforeEach(() => {
    run("TRUNCATE academic_assignment_events, assignment_targets, assignments;");
    run(`UPDATE users SET role='FACULTY' WHERE id='${actor}';`);
  });
  afterAll(() => {
    try { if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" }); }
    finally { if (root) rmSync(root, { recursive: true, force: true }); }
  });

  it("생성 재시도는 한 과제·감사만 생성하고 내용은 감사에 복제하지 않는다", () => {
    const request = randomUUID();
    const first = JSON.parse(run(mutate("CREATE", content(), request)));
    const replay = JSON.parse(run(mutate("CREATE", content(), request)));
    expect(replay.assignment.id).toBe(first.assignment.id);
    expect(replay.replayed).toBe(true);
    expect(counts()).toBe("[1, 0, 1]");
    expect(() => run(mutate("CREATE", { ...content(), title: "다른 제목" }, request))).toThrow();
    const audit = run("SELECT to_jsonb(e) FROM academic_assignment_events e;");
    expect(audit).not.toContain("private@example.invalid");
    expect(audit).not.toContain(content().title);
    expect(JSON.parse(audit).payload_digest).toMatch(/^[0-9a-f]{64}$/);
    expect(first.assignment.due_at).toBeTruthy();
    expect(run(`SELECT due_at AT TIME ZONE 'UTC' FROM assignments WHERE id='${first.assignment.id}';`))
      .toBe("2035-12-31 14:59:59");
  });

  it("초안 마감 생략은 허용하고 공개는 미래 마감·유효 상태를 요구한다", () => {
    const definition = create({ ...content(), dueAt: null });
    expect(() => run(mutate("PUBLISH", { assignmentId: definition.id }))).toThrow();
    expect(() => run(mutate("CLOSE", { assignmentId: definition.id }))).toThrow();
    expect(counts()).toBe("[1, 0, 1]");
    const changed = JSON.parse(run(mutate("UPDATE_DRAFT", { ...content(), dueAt: "2000-01-01T00:00:00Z",
      assignmentId: definition.id, expectedUpdatedAt: definition.updated_at }))).assignment;
    expect(() => run(mutate("PUBLISH", { assignmentId: changed.id }))).toThrow();
    expect(run(`SELECT status FROM assignments WHERE id='${definition.id}';`)).toBe("DRAFT");
  });

  it("정밀 updatedAt 낙관적 잠금은 초안 덮어쓰기를 막고 요청 재시도는 허용한다", () => {
    const definition = create();
    const request = randomUUID();
    const payload = { ...content(), title: "수정 제목", assignmentId: definition.id, expectedUpdatedAt: definition.updated_at };
    const updated = JSON.parse(run(mutate("UPDATE_DRAFT", payload, request)));
    expect(updated.assignment.title).toBe("수정 제목");
    expect(JSON.parse(run(mutate("UPDATE_DRAFT", payload, request))).replayed).toBe(true);
    expect(() => run(mutate("UPDATE_DRAFT", { ...payload, title: "오래된 탭 저장" }))).toThrow();
    expect(counts()).toBe("[1, 0, 2]");
  });

  it("다른 기수 수업·세션과 미지정/권한 회수 계정을 거부한다", () => {
    expect(() => run(mutate("CREATE", { ...content(), scheduleEventId: otherEvent, scheduleSessionId: null }))).toThrow();
    expect(() => run(mutate("CREATE", { ...content(), scheduleSessionId: otherSession }))).toThrow();
    expect(() => run(mutate("CREATE", content(), randomUUID(), other, actor))).toThrow();
    run(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);
    expect(() => run(mutate("CREATE", content()))).toThrow();
    expect(counts()).toBe("[0, 0, 0]");
  });

  it("최초 공개는 명부 전원1건이고 신규등록 후 재공개와 종료에도 스냅샷을 유지한다", () => {
    const definition = create();
    const published = JSON.parse(run(mutate("PUBLISH", { assignmentId: definition.id })));
    expect(published.targetCount).toBe(1);
    expect(published.assignment.status).toBe("PUBLISHED");
    run(`INSERT INTO academic_students (id,display_name) VALUES ('50000000-0000-4000-8000-000000000002','추가 학생');
      INSERT INTO cohort_enrollments (student_id,cohort_id) VALUES ('50000000-0000-4000-8000-000000000002','${cohort}');`);
    try {
      expect(JSON.parse(run(mutate("PUBLISH", { assignmentId: definition.id }))).targetCount).toBe(1);
      expect(() => run(mutate("UPDATE_DRAFT", { ...content(), assignmentId: definition.id,
        expectedUpdatedAt: published.assignment.updated_at }))).toThrow();
      expect(() => run(`UPDATE assignments SET title='공개 후 수정' WHERE id='${definition.id}';`)).toThrow();
      expect(() => run(`DELETE FROM assignments WHERE id='${definition.id}';`)).toThrow();
      expect(() => run("DELETE FROM assignment_targets;")).toThrow();
      const closed = JSON.parse(run(mutate("CLOSE", { assignmentId: definition.id })));
      expect(closed.assignment.status).toBe("CLOSED");
      expect(JSON.parse(run(mutate("PUBLISH", { assignmentId: definition.id }))).assignment.status).toBe("CLOSED");
      expect(closed.targetCount).toBe(1);
    } finally {
      run("DELETE FROM cohort_enrollments WHERE student_id='50000000-0000-4000-8000-000000000002'; DELETE FROM academic_students WHERE id='50000000-0000-4000-8000-000000000002';");
    }
  });

  it("대상0명 과제도 공개할 수 있다", () => {
    const definition = create({ ...content(), cohortId: otherCohort, scheduleEventId: otherEvent, scheduleSessionId: otherSession });
    const published = JSON.parse(run(mutate("PUBLISH", { assignmentId: definition.id })));
    expect(published.assignment.status).toBe("PUBLISHED");
    expect(published.targetCount).toBe(0);
  });

  it("미리보기 후 초안 버전 또는 대상 명부가 바뀌면 공개와 스냅샷을 전부 취소한다", () => {
    const definition = create();
    const fingerprint = run(`SELECT encode(sha256(convert_to(COALESCE(string_agg(id::text,',' ORDER BY id),''),'UTF8')),'hex')
      FROM cohort_enrollments WHERE cohort_id='${cohort}' AND status='ENROLLED' AND ended_at IS NULL;`);
    const preview = { assignmentId: definition.id, expectedUpdatedAt: definition.updated_at, expectedTargetFingerprint: fingerprint };
    run(mutate("UPDATE_DRAFT", { ...content(), title: "다른 탭에서 수정", assignmentId: definition.id, expectedUpdatedAt: definition.updated_at }));
    expect(() => run(mutate("PUBLISH", preview))).toThrow();
    const currentVersion = run(`SELECT to_jsonb(updated_at) FROM assignments WHERE id='${definition.id}';`);
    const currentPreview = { ...preview, expectedUpdatedAt: JSON.parse(currentVersion) };
    run("UPDATE cohort_enrollments SET ended_at=clock_timestamp();");
    try {
      expect(() => run(mutate("PUBLISH", currentPreview))).toThrow();
      expect(run(`SELECT status FROM assignments WHERE id='${definition.id}';`)).toBe("DRAFT");
      expect(counts()).toBe("[1, 0, 2]");
    } finally { run("UPDATE cohort_enrollments SET ended_at=NULL;"); }
    const request = randomUUID();
    run(mutate("PUBLISH", currentPreview, request));
    expect(JSON.parse(run(mutate("PUBLISH", currentPreview, request))).replayed).toBe(true);
  });

  it("미리보기 때 미래 등록이 공개 시각 전에 유효해져도 확인값 불일치로 롤백한다", async () => {
    const definition = create();
    const fingerprint = run(`SELECT encode(sha256(convert_to(COALESCE(string_agg(id::text,',' ORDER BY id),''),'UTF8')),'hex')
      FROM cohort_enrollments WHERE cohort_id='${cohort}' AND status='ENROLLED' AND ended_at IS NULL;`);
    run(`INSERT INTO academic_students (id,display_name) VALUES ('50000000-0000-4000-8000-000000000003','미래 등록 학생');
      INSERT INTO cohort_enrollments (student_id,cohort_id,enrolled_at)
      VALUES ('50000000-0000-4000-8000-000000000003','${cohort}',clock_timestamp()+interval '1 second');`);
    try {
      await delay(1100);
      expect(() => run(mutate("PUBLISH", { assignmentId: definition.id, expectedUpdatedAt: definition.updated_at,
        expectedTargetFingerprint: fingerprint }))).toThrow();
      expect(counts()).toBe("[1, 0, 1]");
      expect(run(`SELECT status FROM assignments WHERE id='${definition.id}';`)).toBe("DRAFT");
    } finally {
      run("DELETE FROM cohort_enrollments WHERE student_id='50000000-0000-4000-8000-000000000003'; DELETE FROM academic_students WHERE id='50000000-0000-4000-8000-000000000003';");
    }
  },15000);

  it("감사 실패·커밋 전 요청 중단은 공개와 대상 생성을 함께 롤백한다", () => {
    const definition = create();
    run("ALTER TABLE academic_assignment_events ADD CONSTRAINT test_failure CHECK (action <> 'PUBLISH');");
    try { expect(() => run(mutate("PUBLISH", { assignmentId: definition.id }))).toThrow(); }
    finally { run("ALTER TABLE academic_assignment_events DROP CONSTRAINT test_failure;"); }
    expect(counts()).toBe("[1, 0, 1]");
    expect(run(`SELECT status FROM assignments WHERE id='${definition.id}';`)).toBe("DRAFT");
    const request = randomUUID();
    run(`BEGIN; ${mutate("PUBLISH", { assignmentId: definition.id }, request)}`);
    expect(counts()).toBe("[1, 0, 1]");
    expect(JSON.parse(run(mutate("PUBLISH", { assignmentId: definition.id }, request))).targetCount).toBe(1);
  });

  it("동시 공개는 대상 스냅샷을 한 번만 만든다", async () => {
    const definition = create();
    const first = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const second = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const done = (child: typeof first) => new Promise<number | null>((resolve, reject) => {
      child.on("error", reject); child.on("close", resolve);
    });
    const firstDone = done(first); const secondDone = done(second);
    const waitFor = async (query: string) => {
      for (let i=0; i<100; i++) { if (run(query)==="1") return; await delay(20); }
      throw new Error("동시 공개 잠금 상태를 확인하지 못했습니다.");
    };
    try {
      first.stdin.write(`SET application_name='assignment_action_first'; BEGIN; ${mutate("PUBLISH", { assignmentId: definition.id })}\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='assignment_action_first' AND state='idle in transaction';");
      second.stdin.end(`SET application_name='assignment_action_second'; ${mutate("PUBLISH", { assignmentId: definition.id })}`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='assignment_action_second' AND wait_event_type='Lock';");
      first.stdin.end("COMMIT;\n");
      expect(await firstDone).toBe(0); expect(await secondDone).toBe(0);
      expect(counts()).toBe("[1, 1, 3]");
    } finally {
      for (const child of [first,second]) {
        if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n");
        if (child.exitCode===null) child.kill();
      }
      await Promise.all([firstDone,secondDone]);
    }
  }, 15000);

  it("감사 Drizzle·SQL 컬럼/제약이 일치하고 다른 기존 구조는 재실행에서 거부한다", () => {
    const config = getTableConfig(academicAssignmentEvents);
    expect(JSON.parse(run(`SELECT jsonb_agg(jsonb_build_object('name',attname,'type',format_type(atttypid,atttypmod),
      'required',attnotnull) ORDER BY attnum) FROM pg_attribute
      WHERE attrelid='academic_assignment_events'::regclass AND attnum>0 AND NOT attisdropped;`)))
      .toEqual(config.columns.map(column => ({ name:column.name,type:column.getSQLType().replace(/^varchar\(/,"character varying("),required:column.notNull })));
    for (const constraint of [...config.checks,...config.foreignKeys]) {
      const name = "getName" in constraint ? constraint.getName() : constraint.name;
      expect(run(`SELECT count(*) FROM pg_constraint WHERE conrelid='academic_assignment_events'::regclass AND conname='${name}';`)).toBe("1");
    }
    const migration = readFileSync("scripts/migrate-academic-assignment-actions.sql","utf8");
    run("ALTER TABLE academic_assignment_events ALTER COLUMN created_at DROP DEFAULT;");
    try { expect(() => run(migration)).toThrow(); }
    finally { run("ALTER TABLE academic_assignment_events ALTER COLUMN created_at SET DEFAULT now();"); }
    run(migration);
  });
});
