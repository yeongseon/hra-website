/**
 * 자료 다운로드 QA 전용 임시 PostgreSQL 클러스터와 합성 fixture를 관리합니다.
 * 운영 연결 문자열·환경 파일을 읽지 않으며 TCP를 열지 않고 고유한 유닉스 소켓만 사용합니다.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { hashSync } from "bcryptjs";
import { qaDatabaseUrl, sqlLiteral } from "./neon-psql-transport.mjs";

export const qaUsers = Object.fromEntries(["PENDING", "MEMBER", "FACULTY", "ADMIN"].map((role, index) => [role, {
  id: `10000000-0000-4000-8000-00000000000${index + 1}`,
  email: `${role.toLowerCase()}@resource-qa.invalid`,
}]));
export const qaResourceIds = {
  student: "20000000-0000-4000-8000-000000000001",
  faculty: "20000000-0000-4000-8000-000000000002",
  guidebook: "20000000-0000-4000-8000-000000000003",
};
export const qaPassword = "resource-qa-only-password";

/** CLI 오류의 원문은 SQL이나 연결 정보를 포함할 수 있어 외부로 전달하지 않습니다. */
export function createQaPostgres(bin) {
  if (!bin) throw new Error("HRA_TEST_PG_BIN이 필요합니다.");
  const root = realpathSync(mkdtempSync(join(tmpdir(), "hra-resource-http-")));
  const environment = {
    HRA_RESOURCE_QA_ROOT: root, HRA_TEST_PG_BIN: bin, DATABASE_URL: qaDatabaseUrl,
    PGHOST: root, PGPORT: "55487", PGUSER: "hra_resource_qa", PGDATABASE: "hra_resource_qa",
    PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5", PGPASSWORD: "",
  };
  let started = false;
  const invoke = (program, args, input, overrides = {}) => {
    const result = spawnSync(join(bin, program), args, {
      input, encoding: "utf8", env: { LC_ALL: "C", ...environment, ...overrides },
      maxBuffer: 8 * 1024 * 1024, timeout: 30_000,
    });
    if (result.status !== 0 || result.error) throw new Error(`격리 PostgreSQL ${program} 실행 실패`);
    return result.stdout;
  };
  const sql = (statement) => invoke("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], statement).trim();
  const close = () => {
    try {
      if (started) invoke("pg_ctl", ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  };
  try {
    writeFileSync(join(root, "qa-scope.json"), JSON.stringify({ root, port: environment.PGPORT }), { mode: 0o600 });
    invoke("initdb", ["-D", join(root, "data"), "-A", "trust", "-U", environment.PGUSER, "--no-locale", "-E", "UTF8"]);
    invoke("pg_ctl", ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o",
      `-h '' -k ${root} -p ${environment.PGPORT} -c log_min_error_statement=panic -c log_min_messages=panic`, "-w", "start"]);
    started = true;
    invoke("createdb", [environment.PGDATABASE], undefined, { PGDATABASE: "postgres" });
    return { root, environment, sql, close };
  } catch (error) { close(); throw error; }
}

/** 본문 URL은 전용 QA 파일만 받으며, 실제 운영 자료나 회원은 복사하지 않습니다. */
export function installQaFixture(cluster, blobUrl) {
  const passwordHash = hashSync(qaPassword, 12);
  cluster.sql(`
    CREATE TYPE user_role AS ENUM ('ADMIN', 'FACULTY', 'MEMBER', 'PENDING');
    CREATE TABLE users (
      id uuid PRIMARY KEY, name varchar(100) NOT NULL, email varchar(255) UNIQUE NOT NULL,
      password_hash text, role user_role NOT NULL, cohort_id uuid, image text,
      oauth_provider text, oauth_provider_account_id text, session_version integer NOT NULL DEFAULT 0,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
    );
    CREATE TABLE class_materials (
      id uuid PRIMARY KEY, title varchar(300) NOT NULL, file_url text NOT NULL,
      file_name varchar(500) NOT NULL, audience varchar(20) NOT NULL
    );
    CREATE TABLE guidebooks (id uuid PRIMARY KEY, file_url text NOT NULL, file_name varchar(500) NOT NULL);
    CREATE TABLE application_submissions (id uuid PRIMARY KEY);
    ${Object.entries(qaUsers).map(([role, user]) => `INSERT INTO users (id, name, email, password_hash, role)
      VALUES (${sqlLiteral(user.id)}, '자료 접근 시험 계정', ${sqlLiteral(user.email)}, ${sqlLiteral(passwordHash)}, ${sqlLiteral(role)});`).join("\n")}
    INSERT INTO class_materials VALUES
      (${sqlLiteral(qaResourceIds.student)}, '회원 자료 시험', ${sqlLiteral(blobUrl)}, '회원 시험.pdf', 'STUDENT'),
      (${sqlLiteral(qaResourceIds.faculty)}, '교수 자료 시험', ${sqlLiteral(blobUrl)}, '교수 시험.pdf', 'FACULTY');
    INSERT INTO guidebooks VALUES (${sqlLiteral(qaResourceIds.guidebook)}, ${sqlLiteral(blobUrl)}, '가이드 시험.pdf');
  `);
  cluster.sql(readFileSync(new URL("../../scripts/sql/rate-limit-reservations.sql", import.meta.url), "utf8"));
}
