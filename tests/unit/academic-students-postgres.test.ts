// @vitest-environment node
/**
 * #144 학생 식별자·기수 등록 migration을 실제 격리 PostgreSQL에서 실행한다.
 * 재실행, 기존 데이터 보존, 계정 미연결, 다중 기수, FK 삭제 보호와 동시 이중 등록을 검증한다.
 * 운영 DB 주소를 읽거나 연결하지 않는다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { getTableConfig } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { academicStudents, cohortEnrollments } from "@/lib/db/schema";

const bin = process.env.HRA_TEST_PG_BIN;
const migration = readFileSync("scripts/migrate-academic-students.sql", "utf8");
const preflight = readFileSync("scripts/preflight-academic-students.sql", "utf8");
// 아래 UUID는 격리 테스트 전용이며 실제 회원 식별자가 아니다.
const userId = "10000000-0000-4000-8000-000000000001";
const cohortA = "20000000-0000-4000-8000-000000000001";
const cohortB = "20000000-0000-4000-8000-000000000002";
const studentId = "30000000-0000-4000-8000-000000000001";

describe.skipIf(!bin)("학생·기수 학적 migration", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  let legacySnapshot: string;
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();
  const legacy = () => run(`SELECT jsonb_build_object(
    'users', (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u),
    'cohorts', (SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM cohorts c),
    'applications', (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM application_submissions a));`);

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-academic-students-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55449`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55449", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE cohorts (id uuid PRIMARY KEY, name text NOT NULL);
      CREATE TABLE users (id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL,
        role text NOT NULL, cohort_id uuid REFERENCES cohorts(id) ON DELETE SET NULL);
      CREATE TABLE application_submissions (id uuid PRIMARY KEY, status text NOT NULL, cohort_id uuid REFERENCES cohorts(id));
      INSERT INTO cohorts VALUES ('${cohortA}', '시험 기수 가'), ('${cohortB}', '시험 기수 나');
      INSERT INTO users VALUES ('${userId}', '시험 회원', 'fixture@example.invalid', 'MEMBER', '${cohortA}');
      INSERT INTO application_submissions VALUES (gen_random_uuid(), 'ACCEPTED', '${cohortA}');`);
    legacySnapshot = legacy();
    run(preflight);
    run(migration);
    run(migration);
  }, 30000);

  beforeEach(() => run("TRUNCATE cohort_enrollments, academic_students;"));
  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("신규·반복 적용이 기존 회원·기수·지원서 행을 변경하지 않는다", () => {
    expect(legacy()).toBe(legacySnapshot);
    expect(run("SELECT count(*) FROM academic_students;")).toBe("0");
    expect(run("SELECT count(*) FROM cohort_enrollments;")).toBe("0");
  });

  it("Drizzle 컬럼·FK·UNIQUE·인덱스와 SQL 카탈로그가 일치한다", () => {
    for (const table of [academicStudents, cohortEnrollments]) {
      const config = getTableConfig(table);
      const columns = JSON.parse(run(`SELECT json_agg(json_build_object('name', a.attname,
        'type', format_type(a.atttypid, a.atttypmod), 'notNull', a.attnotnull) ORDER BY a.attnum)
        FROM pg_attribute a WHERE a.attrelid = '${config.name}'::regclass
          AND a.attnum > 0 AND NOT a.attisdropped;`));
      expect(columns).toEqual(config.columns.map(column => ({
        // PostgreSQL은 varchar의 정식 이름을 character varying으로 반환한다.
        name: column.name, type: column.getSQLType().replace(/^varchar\(/, "character varying("), notNull: column.notNull,
      })));
      for (const fk of config.foreignKeys) {
        const reference = fk.reference();
        expect(run(`SELECT confdeltype FROM pg_constraint WHERE conrelid = '${config.name}'::regclass
          AND conname = '${fk.getName()}';`)).toBe("r");
        expect(reference.columns).toHaveLength(1);
      }
      for (const unique of config.uniqueConstraints) {
        expect(run(`SELECT pg_get_constraintdef(oid) FROM pg_constraint
          WHERE conrelid = '${config.name}'::regclass AND conname = '${unique.getName()}';`))
          .toBe(`UNIQUE (${unique.columns.map(column => column.name).join(", ")})`);
      }
    }
    expect(run("SELECT indexdef FROM pg_indexes WHERE indexname = 'cohort_enrollments_cohort_status_idx';"))
      .toContain("(cohort_id, status)");
  });

  it("여러 미연결 학생과 한 학생의 여러 기수를 허용하고 중복 계정·등록은 거부한다", () => {
    run(`INSERT INTO academic_students (id, user_id, display_name) VALUES ('${studentId}', '${userId}', '학생 가');
      INSERT INTO academic_students (display_name) VALUES ('미연결 가'), ('미연결 나');
      INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES
        ('${studentId}', '${cohortA}'), ('${studentId}', '${cohortB}');`);
    expect(run("SELECT count(*) FROM academic_students WHERE user_id IS NULL;")).toBe("2");
    expect(run("SELECT count(*) FROM cohort_enrollments;")).toBe("2");
    expect(() => run(`INSERT INTO academic_students (user_id, display_name) VALUES ('${userId}', '중복');`)).toThrow();
    expect(() => run(`INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES ('${studentId}', '${cohortA}');`)).toThrow();
    expect(legacy()).toBe(legacySnapshot);
    expect(run(preflight)).toContain('"academic_students_exists": true');
  });

  it("참조가 있는 학생·기수·연결 계정·등록자를 연쇄 삭제하지 않는다", () => {
    run(`INSERT INTO academic_students (id, user_id, display_name) VALUES ('${studentId}', '${userId}', '학생 가');
      INSERT INTO cohort_enrollments (student_id, cohort_id, created_by_user_id)
        VALUES ('${studentId}', '${cohortA}', '${userId}');`);
    for (const query of [
      `DELETE FROM academic_students WHERE id = '${studentId}';`,
      `DELETE FROM cohorts WHERE id = '${cohortA}';`,
      `DELETE FROM users WHERE id = '${userId}';`,
    ]) expect(() => run(query)).toThrow();
    // 연결 해제 후에도 등록 승인자의 FK가 별도로 삭제를 막아 감사 주체를 보존한다.
    run(`UPDATE academic_students SET user_id = NULL WHERE id = '${studentId}';`);
    expect(() => run(`DELETE FROM users WHERE id = '${userId}';`)).toThrow();
    expect(legacy()).toBe(legacySnapshot);
  });

  it("빈 이름·없는 참조·역전된 등록 시각을 거부한다", () => {
    expect(() => run("INSERT INTO academic_students (display_name) VALUES ('   ');")).toThrow();
    expect(() => run(`INSERT INTO academic_students (user_id, display_name) VALUES (gen_random_uuid(), '없는 계정');`)).toThrow();
    run(`INSERT INTO academic_students (id, display_name) VALUES ('${studentId}', '학생 가');`);
    expect(() => run(`INSERT INTO cohort_enrollments (student_id, cohort_id, enrolled_at, ended_at)
      VALUES ('${studentId}', '${cohortA}', '2026-10-16T09:00:00+09', '2026-10-15T09:00:00+09');`)).toThrow();
    expect(() => run(`INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES ('${studentId}', gen_random_uuid());`)).toThrow();
  });

  it("사용자 UNIQUE와 기수·상태 인덱스로 학적을 조회한다", () => {
    run(`SET enable_seqscan = off;
      INSERT INTO academic_students (id, user_id, display_name) VALUES ('${studentId}', '${userId}', '학생 가');
      INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES ('${studentId}', '${cohortA}');`);
    const plan = run(`SET enable_seqscan = off; EXPLAIN SELECT e.id FROM academic_students s
      JOIN cohort_enrollments e ON e.student_id = s.id WHERE s.user_id = '${userId}';`);
    expect(plan).toContain("academic_students_user_id_unique");
    expect(plan).toContain("cohort_enrollments_student_cohort_unique");
    expect(run(`SET enable_seqscan = off; EXPLAIN SELECT id FROM cohort_enrollments
      WHERE cohort_id = '${cohortA}' AND status = 'ENROLLED';`)).toContain("cohort_enrollments_cohort_status_idx");
  });

  it("동시 이중 등록은 한 건만 확정한다", async () => {
    run(`INSERT INTO academic_students (id, display_name) VALUES ('${studentId}', '학생 가');`);
    const first = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const firstDone = new Promise<number | null>((resolve, reject) => { first.on("error", reject); first.on("close", resolve); });
    const second = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let secondError = "";
    second.stderr.on("data", chunk => { secondError += String(chunk); });
    const secondDone = new Promise<number | null>((resolve, reject) => { second.on("error", reject); second.on("close", resolve); });
    const waitFor = async (query: string) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run(query) === "1") return;
        await delay(20);
      }
      throw new Error("동시 등록 테스트의 트랜잭션 대기 상태를 확인하지 못했습니다.");
    };
    try {
      first.stdin.write(`SET application_name = 'academic_first'; BEGIN;
        INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES ('${studentId}', '${cohortA}');\n`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'academic_first' AND state = 'idle in transaction';");
      second.stdin.end(`SET application_name = 'academic_second';
        INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES ('${studentId}', '${cohortA}');`);
      await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'academic_second' AND wait_event_type = 'Lock';");
      first.stdin.end("COMMIT;\n");
      expect(await firstDone).toBe(0);
      expect(await secondDone).toBe(3);
      expect(secondError).toContain("cohort_enrollments_student_cohort_unique");
      expect(run("SELECT count(*) FROM cohort_enrollments;")).toBe("1");
    } finally {
      for (const child of [first, second]) {
        if (!child.stdin.writableEnded) child.stdin.end("ROLLBACK;\n");
        if (child.exitCode === null) child.kill();
      }
      await Promise.all([firstDone, secondDone]);
    }
  }, 15000);

  it("구조가 다른 기존 테이블을 덮지 않고 신규 생성까지 전부 롤백한다", () => {
    run("DROP TABLE cohort_enrollments, academic_students; CREATE TABLE academic_students (id uuid PRIMARY KEY);");
    try {
      expect(() => run(preflight)).toThrow();
      expect(() => run(migration)).toThrow();
      expect(run("SELECT to_regclass('public.cohort_enrollments') IS NULL;")).toBe("t");
      expect(run("SELECT count(*) FROM information_schema.columns WHERE table_name = 'academic_students';")).toBe("1");
      expect(legacy()).toBe(legacySnapshot);
    } finally {
      run("DROP TABLE academic_students;");
      run(migration);
    }
  });

  it("기존 테이블의 기본값·FK·인덱스 불일치를 자동 보정하지 않는다", () => {
    const cases = [
      ["ALTER TABLE academic_students ADD CONSTRAINT unexpected_limit CHECK (display_name <> '금지');",
        "ALTER TABLE academic_students DROP CONSTRAINT unexpected_limit;"],
      ["ALTER TABLE academic_students ENABLE ROW LEVEL SECURITY;",
        "ALTER TABLE academic_students DISABLE ROW LEVEL SECURITY;"],
      ["CREATE INDEX unexpected_student_name_idx ON academic_students (display_name);",
        "DROP INDEX unexpected_student_name_idx;"],
      ["ALTER TABLE cohort_enrollments ALTER COLUMN status DROP DEFAULT;",
        "ALTER TABLE cohort_enrollments ALTER COLUMN status SET DEFAULT 'ENROLLED';"],
      ["ALTER TABLE academic_students DROP CONSTRAINT academic_students_user_id_users_id_fk;",
        "ALTER TABLE academic_students ADD CONSTRAINT academic_students_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;"],
      ["DROP INDEX cohort_enrollments_cohort_status_idx; CREATE INDEX cohort_enrollments_cohort_status_idx ON cohort_enrollments (status);",
        "DROP INDEX cohort_enrollments_cohort_status_idx; CREATE INDEX cohort_enrollments_cohort_status_idx ON cohort_enrollments (cohort_id, status);"],
    ];
    for (const [damage, repair] of cases) {
      run(damage);
      try {
        expect(() => run(migration)).toThrow();
        expect(legacy()).toBe(legacySnapshot);
      } finally {
        run(repair);
      }
      run(migration);
    }
  });

  it("읽기 전용 preflight는 연결·등록 중복을 찾아내고 행을 수정하지 않는다", () => {
    run(`ALTER TABLE academic_students DROP CONSTRAINT academic_students_user_id_unique;
      INSERT INTO academic_students (user_id, display_name) VALUES
        ('${userId}', '중복 가'), ('${userId}', '중복 나');`);
    try {
      expect(() => run(preflight)).toThrow();
      expect(run("SELECT count(*) FROM academic_students;")).toBe("2");
    } finally {
      run("TRUNCATE cohort_enrollments, academic_students; ALTER TABLE academic_students ADD CONSTRAINT academic_students_user_id_unique UNIQUE (user_id);");
    }
    run(`ALTER TABLE cohort_enrollments DROP CONSTRAINT cohort_enrollments_student_cohort_unique;
      INSERT INTO academic_students (id, display_name) VALUES ('${studentId}', '학생 가');
      INSERT INTO cohort_enrollments (student_id, cohort_id) VALUES
        ('${studentId}', '${cohortA}'), ('${studentId}', '${cohortA}');`);
    try {
      expect(() => run(preflight)).toThrow();
      expect(run("SELECT count(*) FROM cohort_enrollments;")).toBe("2");
    } finally {
      run("TRUNCATE cohort_enrollments, academic_students; ALTER TABLE cohort_enrollments ADD CONSTRAINT cohort_enrollments_student_cohort_unique UNIQUE (student_id, cohort_id);");
    }
    expect(legacy()).toBe(legacySnapshot);
  });
});
