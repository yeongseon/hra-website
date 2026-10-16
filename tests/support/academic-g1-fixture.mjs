/** G1 전용 합성 계정·기수·명부와 실제 범위 SQL의 순차 적용 계약을 관리한다. */
import { readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { installQaFixture, qaUsers } from "./resource-qa-postgres.mjs";
import { createPsqlTransport } from "./neon-psql-transport.mjs";
import { resourceQaPdfBytes } from "./resource-qa-pdf.mjs";

const id = (group, number) => `${group}0000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
export const academicG1Actors = {
  studentA: { ...qaUsers.MEMBER, role: "MEMBER" },
  peerA: { id: id(1, 5), email: "peer-a@academic-g1.invalid", role: "MEMBER" },
  studentB: { id: id(1, 6), email: "student-b@academic-g1.invalid", role: "MEMBER" },
  manager: { ...qaUsers.FACULTY, role: "FACULTY" },
  faculty: { id: id(1, 7), email: "faculty@academic-g1.invalid", role: "FACULTY" },
  admin: { ...qaUsers.ADMIN, role: "ADMIN" }, pending: { ...qaUsers.PENDING, role: "PENDING" },
};
export const academicG1Ids = {
  cohortA: id(3, 1), cohortB: id(3, 2), event: id(5, 1), session: id(6, 1),
  studentA: id(4, 1), peerA: id(4, 2), studentB: id(4, 3), unlinked: id(4, 4),
  active: id(7, 1), other: id(7, 2), draft: id(7, 3), closed: id(7, 4),
};
export const academicG1Migrations = [
  "migrate-academic-students.sql", "migrate-academic-enrollment-links.sql", "migrate-academic-roster.sql",
  "migrate-academic-assignments.sql", "migrate-academic-submissions.sql", "migrate-academic-assignment-actions.sql",
  "migrate-academic-upload-authorizations.sql", "migrate-academic-submission-finalization.sql",
  "migrate-academic-submission-file-reads.sql",
];

/** 비활성 단계에는 신규 학사 표를 만들지 않고 실제 credentials의 기존 users/rate-limit만 준비한다. */
export function installAcademicG1Base(cluster) {
  installQaFixture(cluster, "https://academic-g1.invalid/unused.pdf");
  for (const actor of [academicG1Actors.peerA, academicG1Actors.studentB, academicG1Actors.faculty]) {
    cluster.sql(`INSERT INTO users(id,name,email,password_hash,role)
      SELECT '${actor.id}','학사 합성 시험 계정','${actor.email}',password_hash,'${actor.role}'
      FROM users WHERE id='${qaUsers.MEMBER.id}';`);
  }
  cluster.sql(`CREATE TABLE cohorts(id uuid PRIMARY KEY,name varchar(100) NOT NULL,"order" integer NOT NULL DEFAULT 0);
    CREATE TABLE schedule_events(id uuid PRIMARY KEY,cohort_id uuid REFERENCES cohorts(id),title varchar(200) NOT NULL,event_date timestamp NOT NULL,event_type text NOT NULL);
    CREATE TABLE schedule_sessions(id uuid PRIMARY KEY,schedule_event_id uuid NOT NULL REFERENCES schedule_events(id),category text NOT NULL,content text,sub_title text,"order" integer NOT NULL DEFAULT 0);
    INSERT INTO cohorts(id,name) VALUES('${academicG1Ids.cohortA}','G1 시험 기수 가'),('${academicG1Ids.cohortB}','G1 시험 기수 나');
    INSERT INTO schedule_events VALUES('${academicG1Ids.event}','${academicG1Ids.cohortA}','G1 시험 수업',now(),'CLASS');
    INSERT INTO schedule_sessions(id,schedule_event_id,category,content)VALUES('${academicG1Ids.session}','${academicG1Ids.event}','CLASSICS','시험 세부 수업');`);
}

/** 각 baseline은 후속 트리거 설치 전에 즉시 재실행한다. 완료 뒤 옛 baseline을 덮어쓰지 않는다. */
export function installAcademicG1Migrations(cluster) {
  const migrations = academicG1Migrations.map((name) => readFileSync(new URL(`../../scripts/${name}`, import.meta.url), "utf8"));
  for (const migration of migrations) { cluster.sql(migration); cluster.sql(migration); }
}

/** 수용 흐름은 학생·제출을 자동 연결하지 않는다. 여기서 명시한 합성 UUID만 fixture로 승인한다. */
export function seedAcademicG1Domain(cluster) {
  const people = [
    [academicG1Ids.studentA, academicG1Actors.studentA.id, "시험 학생 가", academicG1Ids.cohortA],
    [academicG1Ids.peerA, academicG1Actors.peerA.id, "=시험 학생 동료", academicG1Ids.cohortA],
    [academicG1Ids.studentB, academicG1Actors.studentB.id, "시험 학생 나", academicG1Ids.cohortB],
    [academicG1Ids.unlinked, null, "시험 미연결 학생", academicG1Ids.cohortA],
  ];
  for (const [student, user, name, cohort] of people) cluster.sql(`INSERT INTO academic_students(id,user_id,display_name)
    VALUES('${student}',${user ? `'${user}'` : "NULL"},'${name}');
    INSERT INTO cohort_enrollments(student_id,cohort_id,created_by_user_id)VALUES('${student}','${cohort}','${academicG1Actors.manager.id}');`);
  for (const [assignment, cohort, title] of [[academicG1Ids.active, academicG1Ids.cohortA, "G1 제출 수용 과제"],
    [academicG1Ids.other, academicG1Ids.cohortB, "다른 기수 비공개 안내"],
    [academicG1Ids.draft, academicG1Ids.cohortA, "미공개 과제 안내"], [academicG1Ids.closed, academicG1Ids.cohortA, "종료된 제출 시험"]]) {
    cluster.sql(`INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)
      VALUES('${assignment}','${cohort}','${title}',clock_timestamp()+interval '1 day','${academicG1Actors.manager.id}');`);
    if (assignment !== academicG1Ids.draft) cluster.sql(`SELECT publish_academic_assignment('${assignment}','${academicG1Actors.manager.id}');`);
  }
  cluster.sql(`UPDATE assignments SET status='CLOSED' WHERE id='${academicG1Ids.closed}';`);
}

/** 테스트 작업자도 공통 전송의 소켓·표식 검사를 거친 격리 DB만 수정할 수 있다. */
export function academicG1Sql(environment) {
  const execute = createPsqlTransport(environment);
  return async (query, params = []) => {
    const result = await execute({ query, params });
    return result.rows[0]?.[0] ?? null;
  };
}

/** 장애 사례는 서로 다른 실제 공개 과제/대상을 사용해 한 사례의 소비 상태를 재사용하지 않는다. */
export async function createAcademicG1Assignment(sql, { cohort = academicG1Ids.cohortA, dueSeconds = 86_400 } = {}) {
  const assignment = randomUUID();
  await sql(`INSERT INTO assignments(id,cohort_id,title,due_at,created_by_user_id)
    VALUES($1::uuid,$2::uuid,'G1 격리 추가 과제',clock_timestamp()+make_interval(secs=>$3::integer),$4::uuid)`,
  [assignment, cohort, dueSeconds, academicG1Actors.manager.id]);
  await sql("SELECT publish_academic_assignment($1::uuid,$2::uuid)", [assignment, academicG1Actors.manager.id]);
  return assignment;
}

/** 실제 DB 시각이 마감에 도달했음을 확인한다. 마이크로초 동시 일치나 JS 시계 고정을 주장하지 않는다. */
export async function verifyAcademicG1Deadline(environment) {
  const sql = academicG1Sql(environment), samples = [];
  const bytes = resourceQaPdfBytes(), checksum = createHash("sha256").update(bytes).digest("hex");
  for (const seconds of [8, 9, 10]) {
    const assignment = await createAcademicG1Assignment(sql, { dueSeconds: seconds });
    const request = randomUUID(), submissionKey = randomUUID();
    const target = await sql(`SELECT t.id FROM assignment_targets t JOIN cohort_enrollments e ON e.id=t.enrollment_id
      JOIN academic_students s ON s.id=e.student_id WHERE t.assignment_id=$1::uuid AND s.user_id=$2::uuid`, [assignment, academicG1Actors.studentA.id]);
    const intent = await sql("SELECT issue_academic_assignment_upload($1::uuid,$2::uuid,$3::uuid,'경계 시험.pdf',$4::integer)",
      [request, target, academicG1Actors.studentA.id, bytes.length]);
    await sql("SELECT verify_authorized_academic_upload($1::uuid,$2::uuid,$3::text,'경계검증ETag')", [intent, academicG1Actors.studentA.id, checksum]);
    samples.push({ assignment, target, intent, submissionKey });
  }
  for (const [index, sample] of samples.entries()) {
    await sql(`SELECT pg_sleep_until(due_at+make_interval(secs=>$2::integer)) FROM assignments WHERE id=$1::uuid`,
      [sample.assignment, index === 0 ? -1 : index === 1 ? 0 : 1]);
    const before = await sql("SELECT clock_timestamp()<due_at FROM assignments WHERE id=$1::uuid", [sample.assignment]);
    if (before !== (index === 0 ? "t" : "f")) throw new Error("G1_DEADLINE_CLOCK");
    let rejected = false;
    try {
      await sql("SELECT complete_academic_assignment_submission($1::uuid,$2::uuid,$3::uuid,$4::uuid,true)",
        [sample.target, academicG1Actors.studentA.id, sample.intent, sample.submissionKey]);
    } catch { rejected = true; }
    if (rejected !== (index !== 0)) throw new Error("G1_DEADLINE_RESULT");
    const count = await sql("SELECT count(*) FROM assignment_submissions WHERE assignment_target_id=$1::uuid", [sample.target]);
    if (count !== (index === 0 ? "1" : "0")) throw new Error("G1_DEADLINE_ROWS");
  }
}

/** 합성 fixture만 있는 같은 격리 클러스터에 복구하고 행·함수 지문 및 drift 실패 원자성을 확인한다. */
export function verifyAcademicG1Recovery(cluster) {
  createPsqlTransport(cluster.environment);
  const environment = Object.fromEntries(["PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGSSLMODE", "PGCONNECT_TIMEOUT", "PGPASSWORD"]
    .map((key) => [key, cluster.environment[key]]));
  const run = (program, args, input) => spawnSync(join(cluster.environment.HRA_TEST_PG_BIN, program), args,
    { input, env: environment, maxBuffer: 32 * 1024 * 1024, timeout: 30_000 });
  const check = (result) => { if (result.status !== 0 || result.error) throw new Error("G1_RECOVERY_COMMAND"); return result.stdout; };
  const fingerprint = `SELECT md5(jsonb_build_array(
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM academic_students x),
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM assignment_targets x),
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM assignment_submissions x),
    (SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM assignment_submission_files x),
    (SELECT string_agg(pg_get_functiondef(p.oid),'' ORDER BY p.oid::regprocedure::text) FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace AND p.prokind='f'))::text)`;
  const snapshot = cluster.sql(fingerprint), backup = check(run("pg_dump", ["--format=custom"], undefined));
  check(run("createdb", ["hra_g1_recovery"], undefined));
  try {
    check(run("pg_restore", ["--exit-on-error", "--dbname=hra_g1_recovery"], backup));
    const restored = check(run("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", "hra_g1_recovery"], fingerprint)).toString().trim();
    if (restored !== snapshot) throw new Error("G1_RECOVERY_FINGERPRINT");
    check(run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "hra_g1_recovery"], "ALTER TABLE academic_submission_file_reads ADD COLUMN qa_drift text"));
    const drift = run("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", "hra_g1_recovery"],
      readFileSync(new URL("../../scripts/migrate-academic-submission-file-reads.sql", import.meta.url), "utf8"));
    if (drift.status === 0) throw new Error("G1_RECOVERY_DRIFT_ACCEPTED");
    const unchanged = check(run("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", "hra_g1_recovery"], fingerprint)).toString().trim();
    if (unchanged !== snapshot) throw new Error("G1_RECOVERY_DRIFT_DATA");
  } finally { check(run("dropdb", ["hra_g1_recovery"], undefined)); }
}
