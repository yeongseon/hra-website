// @vitest-environment node
/**
 * 회원 그룹 변경·삭제 액션의 SQL을 실제 격리 PostgreSQL에서 실행합니다.
 * 승인·세션과 기존 인가 경계, 실제 학적 참조가 있는 회원 삭제 거부를 검증합니다.
 * 운영 환경 파일은 읽지 않으며 SQL 전송은 합성 DB의 유닉스 소켓으로만 제한합니다.
 */
import { neon, neonConfig, NeonDbError } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  logServerError: vi.fn(),
  requests: vi.fn(),
  database: undefined as NeonHttpDatabase<typeof schema> | undefined,
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/errors")>();
  // 실제 정제·console 출력을 거치면서 호출 인수도 검증해 로그 경계를 모킹으로 가리지 않는다.
  return { ...actual, logServerError: mocks.logServerError.mockImplementation(actual.logServerError) };
});
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import { deleteUser, updateUserGroup } from "@/features/users/actions";

const actor = "10000000-0000-4000-8000-000000000001";
const target = "10000000-0000-4000-8000-000000000002";
const cohort = "20000000-0000-4000-8000-000000000001";
const student = "30000000-0000-4000-8000-000000000001";
const enrollment = "40000000-0000-4000-8000-000000000001";
const missingUser = "10000000-0000-4000-8000-000000000099";
const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("회원 승인·삭제 SQL의 실제 PostgreSQL 실행", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const failures: { code: string; constraint?: string }[] = [];
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
    cluster.sql(readFileSync("scripts/migrate-academic-students.sql", "utf8"));
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl)
        throw new Error("격리 SQL 범위 이외 요청 차단");
      mocks.requests();
      try {
        return Response.json(await transport(JSON.parse(String(options.body))));
      } catch (error) {
        // 실제 PG의 비민감 필드만 Neon HTTP 오류로 전달하여 SDK→Drizzle cause 경로를 보존한다.
        if (!error || typeof error !== "object" || !("code" in error)
          || typeof error.code !== "string" || !/^[0-9A-Z]{5}$/.test(error.code)) {
          throw new Error("격리 SQL 전송 실패");
        }
        const constraint = "constraint" in error && typeof error.constraint === "string"
          && /^[a-z_][a-z0-9_]{0,62}$/.test(error.constraint) ? error.constraint : undefined;
        const metadata = { code: error.code, ...(constraint ? { constraint } : {}) };
        failures.push(metadata);
        return Response.json({ message: "격리 데이터베이스 제약 거부", ...metadata }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    failures.length = 0;
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    cluster.sql(`TRUNCATE cohort_enrollments,academic_students,users;
      INSERT INTO users(id,role) VALUES('${actor}','ADMIN'),('${target}','PENDING');`);
  });

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    cluster?.close();
  });

  // 저장 결과를 액션 응답과 별도로 조회하여 SQL이 실제 변경했는지 확인합니다.
  const saved = () => cluster.sql(`SELECT role,coalesce(cohort_id::text,'없음'),session_version FROM users WHERE id='${target}';`);

  /** 합성 행 전체를 비교하여 거부 시 학적·회원·세션 버전이 모두 보존되는지 확인한다. */
  const state = () => cluster.sql(`
    SELECT row_to_json(u) FROM users u ORDER BY id;
    SELECT row_to_json(s) FROM academic_students s ORDER BY id;
    SELECT row_to_json(e) FROM cohort_enrollments e ORDER BY id;
  `);

  /** 예상하지 않은 throw가 RED 로그에 SQL을 노출하지 않도록 실제 SDK cause의 안전 필드만 수집한다. */
  async function attemptDelete(userId: string) {
    try {
      return { result: await deleteUser(userId) };
    } catch (error) {
      const cause = error instanceof Error && "cause" in error ? error.cause : error;
      return { failure: cause instanceof NeonDbError
        ? { neon: true, code: cause.code, constraint: cause.constraint }
        : { neon: false } };
    }
  }

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

  it.each([
    ["본인 학생 식별자", "academic_students_user_id_users_id_fk"],
    ["학적 등록 작성자", "cohort_enrollments_created_by_user_id_users_id_fk"],
  ])("%s로 참조된 회원 삭제는 한국어 실패 응답을 반환하고 데이터를 보존합니다", async (reference, constraint) => {
    cluster.sql(`
      UPDATE users SET role='MEMBER',cohort_id='${cohort}',session_version=7 WHERE id='${target}';
      INSERT INTO academic_students(id,user_id,display_name)
        VALUES('${student}',${reference === "본인 학생 식별자" ? `'${target}'` : "NULL"},'합성 학적 학생');
      INSERT INTO cohort_enrollments(id,student_id,cohort_id,created_by_user_id)
        VALUES('${enrollment}','${student}','${cohort}',
          '${reference === "본인 학생 식별자" ? actor : target}');
    `);
    const before = state();
    const outcome = await attemptDelete(target);
    // throw 대신 처리 가능한 응답이어야 한다. 현재 오류도 SQL 없는 안전한 metadata로만 표시된다.
    expect.soft(outcome).toMatchObject({ result: {
      success: false,
      message: expect.stringMatching(/[가-힣]/),
    } });
    if (outcome.result) {
      expect(outcome.result.message).not.toMatch(/academic_students|cohort_enrollments|23\d{3}|DELETE|SELECT|constraint/i);
    }
    expect(failures).toEqual([{ code: expect.stringMatching(/^(23001|23503)$/), constraint }]);
    expect(state()).toBe(before);
    expect(saved()).toBe(`MEMBER|${cohort}|7`);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("알 수 없는 삭제 DB 오류도 예외 없이 정제된 실패 응답과 서버 로그로 처리합니다", async () => {
    cluster.sql(`UPDATE users SET session_version=7 WHERE id='${target}';`);
    const before = state();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      // 실제 DELETE에서만 합성 P0001을 발생시켜 알려진 학적 FK와 다른 catch 경로를 실행한다.
      cluster.sql(`
        CREATE FUNCTION public.qa_fail_user_delete() RETURNS trigger
        LANGUAGE plpgsql AS $failure$
        BEGIN
          RAISE EXCEPTION USING ERRCODE='P0001', MESSAGE='qa_user_delete_failed';
        END;
        $failure$;
        CREATE TRIGGER qa_fail_user_delete BEFORE DELETE ON public.users
          FOR EACH ROW EXECUTE FUNCTION public.qa_fail_user_delete();
      `);
      const outcome = await attemptDelete(target);
      expect.soft(outcome).toEqual({ result: {
        success: false,
        message: "회원 삭제 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      } });
      if (outcome.result) {
        expect(outcome.result.message).not.toMatch(/P0001|qa_user_delete_failed|DELETE|SELECT|users|constraint/i);
      }
      expect(failures).toEqual([{ code: "P0001" }]);
      expect(state()).toBe(before);
      expect(saved()).toBe("PENDING|없음|7");
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
      expect(mocks.logServerError).toHaveBeenCalledOnce();
      // 원문 SQL을 가진 오류 객체 자체를 assertion 출력으로 복사하지 않는다.
      const [scope, error, context] = mocks.logServerError.mock.calls[0] ?? [];
      expect(scope).toBe("users/delete");
      expect(context).toEqual({ userId: target });
      expect(error instanceof Error && error.message === "회원 삭제 처리 실패").toBe(true);
      expect(error instanceof Error && ("cause" in error || "query" in error || "params" in error)).toBe(false);
      expect(error instanceof NeonDbError).toBe(false);
      expect(consoleError).toHaveBeenCalledOnce();
      const logged = JSON.stringify(consoleError.mock.calls);
      const expectedLog = JSON.stringify([["[users/delete]", {
        context: { userId: target },
        error: { name: "Error", message: "회원 삭제 처리 실패" },
      }]]);
      // 비교 실패 시에도 캡처한 로그 원문을 assertion 출력으로 내보내지 않는다.
      expect(logged === expectedLog).toBe(true);
      expect(/P0001|qa_user_delete_failed|DELETE\s+FROM|SELECT|WITH\s|\$\d|\bparams?\b|constraint/i.test(logged)).toBe(false);
    } finally {
      consoleError.mockRestore();
      // assertion·SQL 실패 여부와 관계없이 다음 회원 삭제 테스트에 영향을 남기지 않는다.
      cluster.sql(`
        DROP TRIGGER IF EXISTS qa_fail_user_delete ON public.users;
        DROP FUNCTION IF EXISTS public.qa_fail_user_delete();
      `);
    }
  });

  it("학적 참조가 없는 일반 회원은 삭제하고 목록 캐시만 무효화합니다", async () => {
    expect(await deleteUser(target)).toEqual({ success: true, message: "회원이 삭제되었습니다." });
    expect(saved()).toBe("");
    expect(cluster.sql("SELECT count(*) FROM academic_students;")).toBe("0");
    expect(mocks.revalidatePath.mock.calls).toEqual([["/admin/users"]]);
  });

  it("없는 회원 삭제는 캐시를 무효화하지 않습니다", async () => {
    const before = state();
    expect(await deleteUser(missingUser)).toEqual({ success: false, message: "해당 사용자를 찾을 수 없습니다." });
    expect(state()).toBe(before);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("자기 자신은 DB 조회 전에 삭제를 거부합니다", async () => {
    const before = state();
    expect(await deleteUser(actor)).toEqual({ success: false, message: "자기 자신은 삭제할 수 없습니다." });
    expect(state()).toBe(before);
    expect(mocks.requests).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("마지막 관리자 삭제는 회원과 세션 버전을 보존합니다", async () => {
    cluster.sql(`UPDATE users SET role='MEMBER' WHERE id='${actor}';
      UPDATE users SET role='ADMIN',session_version=7 WHERE id='${target}';`);
    const before = state();
    expect(await deleteUser(target)).toEqual({ success: false,
      message: "마지막 관리자는 삭제할 수 없습니다. 다른 관리자를 먼저 지정하세요." });
    expect(state()).toBe(before);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it.each(["PENDING", "MEMBER", "FACULTY", null])("관리자가 아닌 %s 삭제는 try 밖의 인가에서 거부합니다", async role => {
    mocks.auth.mockResolvedValue(role ? { user: { id: actor, role } } : null);
    const before = state();
    await expect(deleteUser(target)).rejects.toThrow("REDIRECT:/login");
    expect(state()).toBe(before);
    expect(mocks.requests).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
