// @vitest-environment node
/** 지정 승인자의 현재 DB 역할을 각 명부 조회 SQL에서 확인하는 실제 PG 회귀입니다. */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import { getAcademicRoster, getAcademicStudent, getRosterCohorts } from "@/features/academics/roster/queries";

const actor = "10000000-0000-4000-8000-000000000001";
const cohort = "20000000-0000-4000-8000-000000000001";
const student = "30000000-0000-4000-8000-000000000001";
const bin = process.env.HRA_TEST_PG_BIN;
describe.skipIf(!bin)("명부 조회의 현재 역할 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let beforeExecute: (() => void) | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`CREATE TABLE users(id uuid PRIMARY KEY,role text);
      CREATE TABLE cohorts(id uuid PRIMARY KEY,name text,"order" integer NOT NULL DEFAULT 0);
      INSERT INTO users VALUES('${actor}','FACULTY'); INSERT INTO cohorts(id,name) VALUES('${cohort}','합성 기수');`);
    cluster.sql(readFileSync("scripts/migrate-academic-students.sql", "utf8"));
    cluster.sql(`INSERT INTO academic_students(id,display_name) VALUES('${student}','합성 학생');
      INSERT INTO cohort_enrollments(student_id,cohort_id) VALUES('${student}','${cohort}');`);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl)
        throw new Error("격리 SQL 범위 이외 요청 차단");
      beforeExecute?.();
      return Response.json(await transport(JSON.parse(String(options.body))));
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);
  beforeEach(() => {
    vi.stubEnv("ACADEMIC_ENABLED", "true");
    vi.stubEnv("ACADEMIC_APPROVER_USER_ID", actor);
    cluster.sql(`UPDATE users SET role='FACULTY' WHERE id='${actor}';`);
    beforeExecute = undefined;
    mocks.auth.mockImplementation(async () => {
      cluster.sql(`UPDATE users SET role='PENDING' WHERE id='${actor}';`);
      return { user: { id: actor, role: "FACULTY" } };
    });
  });
  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    vi.unstubAllEnvs();
    cluster?.close();
  });

  it("인가 직후 역할이 철회되면 명부 집계를 0명 성공으로 반환하지 않습니다", async () => {
    await expect(getAcademicRoster()).rejects.toMatchObject({ status: 403 });
  });
  it("인가 직후 역할이 철회되면 학생 상세는 존재를 숨깁니다", async () => {
    expect(await getAcademicStudent(student)).toBeNull();
  });
  it("인가 직후 역할이 철회되면 기수 목록을 반환하지 않습니다", async () => {
    expect(await getRosterCohorts()).toEqual([]);
  });
  it("상세 조회 다음의 등록 조회도 현재 역할을 다시 확인합니다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "FACULTY" } });
    let count = 0;
    beforeExecute = () => { if (++count === 2) cluster.sql(`UPDATE users SET role='PENDING' WHERE id='${actor}';`); };
    expect(await getAcademicStudent(student)).toMatchObject({ id: student, enrollments: [] });
    expect(count).toBe(2);
  });
  it("철회되지 않은 지정 승인자는 명부·상세·기수를 조회합니다", async () => {
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "FACULTY" } });
    expect(await getAcademicRoster()).toMatchObject({ total: 1, students: [{ id: student }] });
    expect(await getAcademicStudent(student)).toMatchObject({ id: student, enrollments: [{ cohortName: "합성 기수" }] });
    expect(await getRosterCohorts()).toMatchObject([{ id: cohort }]);
  });
});
