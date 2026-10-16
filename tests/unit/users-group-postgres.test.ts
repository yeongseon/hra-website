// @vitest-environment node
/**
 * 회원 그룹 변경 액션이 만드는 SQL을 실제 격리 PostgreSQL에서 실행합니다.
 * 승인 성공·기수 저장·세션 종료·동일 값 재저장과 기존 인가 경계를 검증합니다.
 * 운영 환경 파일은 읽지 않으며 SQL 전송은 합성 DB의 유닉스 소켓으로만 제한합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  database: undefined as NeonHttpDatabase<typeof schema> | undefined,
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import { updateUserGroup } from "@/features/users/actions";

const actor = "10000000-0000-4000-8000-000000000001";
const target = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("회원 승인 SQL의 실제 PostgreSQL 실행", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE user_role AS ENUM ('ADMIN','FACULTY','MEMBER','PENDING');
      CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY, role user_role NOT NULL,
        cohort_id uuid REFERENCES cohorts(id), session_version integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now());
      INSERT INTO cohorts VALUES('${cohort}');
    `);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl)
        throw new Error("격리 SQL 범위 이외 요청 차단");
      return Response.json(await transport(JSON.parse(String(options.body))));
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    cluster.sql(`TRUNCATE users;
      INSERT INTO users(id,role) VALUES('${actor}','ADMIN'),('${target}','PENDING');`);
  });

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    cluster?.close();
  });

  // 저장 결과를 액션 응답과 별도로 조회하여 SQL이 실제 변경했는지 확인합니다.
  const saved = () => cluster.sql(`SELECT role,coalesce(cohort_id::text,'없음'),session_version FROM users WHERE id='${target}';`);

  it("승인대기를 기수 회원으로 승인하고 기존 세션을 무효화합니다", async () => {
    expect(await updateUserGroup(target, cohort)).toEqual({ success: true, message: "그룹이 변경되었습니다." });
    expect(saved()).toBe(`MEMBER|${cohort}|1`);
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/users"], [`/admin/users/${target}`]]);
  });

  it.each(["ADMIN", "FACULTY", "PENDING"])("고정 그룹 %s 저장은 기존 기수를 해제합니다", async (role) => {
    cluster.sql(`UPDATE users SET role='MEMBER',cohort_id='${cohort}',session_version=7 WHERE id='${target}';`);
    expect(await updateUserGroup(target, role)).toMatchObject({ success: true });
    expect(saved()).toBe(`${role}|없음|8`);
  });

  it("같은 역할·기수를 재저장해도 기존 세션 버전을 증가시키지 않습니다", async () => {
    cluster.sql(`UPDATE users SET role='MEMBER',cohort_id='${cohort}',session_version=7 WHERE id='${target}';`);
    expect(await updateUserGroup(target, cohort)).toMatchObject({ success: true });
    expect(saved()).toBe(`MEMBER|${cohort}|7`);
  });

  it("마지막 관리자 강등은 저장하지 않습니다", async () => {
    cluster.sql(`UPDATE users SET role='MEMBER' WHERE id='${actor}'; UPDATE users SET role='ADMIN' WHERE id='${target}';`);
    expect(await updateUserGroup(target, "PENDING")).toEqual({ success: false,
      message: "마지막 관리자입니다. 다른 관리자를 먼저 지정한 뒤 역할을 변경하세요." });
    expect(saved()).toBe("ADMIN|없음|0");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "MEMBER", "FACULTY", null])("관리자가 아닌 %s 요청은 저장 전에 거부합니다", async (role) => {
    mocks.auth.mockResolvedValue(role ? { user: { id: actor, role } } : null);
    await expect(updateUserGroup(target, cohort)).rejects.toThrow("REDIRECT:/login");
    expect(saved()).toBe("PENDING|없음|0");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("자기 자신의 그룹 변경은 거부합니다", async () => {
    expect(await updateUserGroup(actor, cohort)).toMatchObject({ success: false });
    expect(cluster.sql(`SELECT role,session_version FROM users WHERE id='${actor}';`)).toBe("ADMIN|0");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("없는 기수는 승인하지 않습니다", async () => {
    expect(await updateUserGroup(target, "20000000-0000-4000-8000-000000000099"))
      .toEqual({ success: false, message: "해당 기수를 찾을 수 없습니다." });
    expect(saved()).toBe("PENDING|없음|0");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
