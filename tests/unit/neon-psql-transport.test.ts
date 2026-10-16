// @vitest-environment node
/**
 * QA 전송 계층이 값을 위조하지 않고 실제 PostgreSQL 형식과 실행 횟수를 보존하는지 검증합니다.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { neon, neonConfig } from "@neondatabase/serverless";
import { bindParameters, createPsqlTransport, parseCsv, qaDatabaseUrl, qaNeonEndpoint, sqlLiteral } from "../support/neon-psql-transport.mjs";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";

describe("QA SQL 값 바인딩", () => {
  it("설치된 Neon 클라이언트가 만드는 정확한 테스트 엔드포인트만 가로챈다", () => {
    const endpoint = neonConfig.fetchEndpoint;
    expect(typeof endpoint === "function" ? endpoint(new URL(qaDatabaseUrl).hostname, 5432) : endpoint).toBe(qaNeonEndpoint);
  });

  it("따옴표·역슬래시·줄바꿈을 단일 리터럴로 보존한다", () => {
    expect(sqlLiteral("O'Reilly\\자료\n둘째 줄")).toBe("'O''Reilly\\자료\n둘째 줄'");
    expect(sqlLiteral(null)).toBe("NULL");
    expect(() => sqlLiteral("\0")).toThrow();
  });

  it("문자열·식별자·주석·달러 문자열 내부의 자리표시자를 건드리지 않는다", () => {
    const query = `SELECT $1::text, '$2', "$3", $$ $4 $$ /* $5 /* $6 */ */ -- $7\n, $1`;
    expect(bindParameters(query, ["값"])).toBe(`SELECT '값'::text, '$2', "$3", $$ $4 $$ /* $5 /* $6 */ */ -- $7\n, '값'`);
    expect(() => bindParameters("SELECT $2", ["값"])).toThrow();
    expect(() => bindParameters("SELECT 1; DELETE FROM users", [])).toThrow();
    expect(() => bindParameters("\\! command", [])).toThrow();
  });

  it("CSV 줄바꿈·빈 값·따옴표와 중복 컬럼을 보존한다", () => {
    expect(parseCsv('same,same\n"a,b","c\n""d"""\n')).toEqual([
      [{ value: "same", quoted: false }, { value: "same", quoted: false }],
      [{ value: "a,b", quoted: true }, { value: 'c\n"d"', quoted: true }],
    ]);
  });
});

describe.skipIf(!process.env.HRA_TEST_PG_BIN)("QA 전송의 실제 PostgreSQL 결과", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let execute: ReturnType<typeof createPsqlTransport>;
  beforeAll(() => {
    cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
    execute = createPsqlTransport(cluster.environment);
    cluster.sql("CREATE TABLE qa_effects (value text); CREATE SEQUENCE qa_execution_count;");
  }, 30_000);
  afterAll(() => cluster?.close());

  it("타입 OID·중복 컬럼·null·빈 문자열·bool·int·한글을 그대로 반환한다", async () => {
    const value = "O'Reilly\\자료\n,$2";
    const result = await execute({
      query: "SELECT $1::text AS same, $2::text AS same, $3::text AS absent, ''::text AS empty, true AS flag, 42::integer AS number",
      params: [value, "둘째", null],
    });
    expect(result.fields).toEqual([
      { name: "same", dataTypeID: 25 }, { name: "same", dataTypeID: 25 },
      { name: "absent", dataTypeID: 25 }, { name: "empty", dataTypeID: 25 },
      { name: "flag", dataTypeID: 16 }, { name: "number", dataTypeID: 23 },
    ]);
    expect(result.rows).toEqual([[value, "둘째", null, "", "t", "42"]]);
    expect(result.rowCount).toBe(1);
  });

  it("SELECT 함수의 부작용을 정확히 한 번 실행한다", async () => {
    await execute({ query: "SELECT nextval('qa_execution_count')", params: [] });
    expect(cluster.sql("SELECT last_value FROM qa_execution_count")).toBe("1");
  });

  it("명령처럼 생긴 값·불리언·숫자 매개변수도 SQL로 재해석하지 않는다", async () => {
    const value = "'; DELETE FROM qa_effects; --\\\n자료";
    const result = await execute({ query: "SELECT $1::text, $2::boolean, $3::integer", params: [value, false, 73] });
    expect(result.rows).toEqual([[value, "f", "73"]]);
    expect(cluster.sql("SELECT count(*) FROM qa_effects")).toBe("0");
  });

  it("INSERT·DELETE와 rowCount를 실제 DB에 반영한다", async () => {
    await execute({ query: "INSERT INTO qa_effects VALUES ($1)", params: ["삭제 시험"] });
    const result = await execute({ query: "DELETE FROM qa_effects WHERE value = $1", params: ["삭제 시험"] });
    expect(result.rows).toEqual([]);
    expect(result.fields).toEqual([]);
    expect(result.rowCount).toBe(1);
    expect(cluster.sql("SELECT count(*) FROM qa_effects")).toBe("0");
  });

  it("실제 Neon 파서가 raw text 응답을 bool·int·JSON으로 복원한다", async () => {
    const client = neon(qaDatabaseUrl, {
      fetchOptions: {}, arrayMode: true, fullResults: true,
    });
    // 설치된 클라이언트의 공개 설정을 사용해 psql 결과와 Neon 파서의 계약도 함께 검증합니다.
    const previous = neonConfig.fetchFunction;
    neonConfig.fetchFunction = async (_input: unknown, options: RequestInit) =>
      Response.json(await execute(JSON.parse(String(options.body))));
    try {
      const result = await client.query("SELECT true AS flag, 42::integer AS number, json_build_array('한글', 7) AS data");
      expect(result.rows).toEqual([[true, 42, ["한글", 7]]]);
    } finally { neonConfig.fetchFunction = previous; }
  });

  it("운영 연결 주소·다른 소켓·다른 DB는 실행 전에 거부한다", () => {
    expect(() => createPsqlTransport({ ...cluster.environment, DATABASE_URL: "postgresql://external.invalid/db" })).toThrow();
    expect(() => createPsqlTransport({ ...cluster.environment, PGHOST: "/tmp" })).toThrow();
    expect(() => createPsqlTransport({ ...cluster.environment, PGDATABASE: "postgres" })).toThrow();
  });

  it("상속된 PGHOSTADDR·서비스·세션 설정이 검증한 소켓을 덮어쓰지 못한다", async () => {
    const isolated = createPsqlTransport({ ...cluster.environment,
      PGHOSTADDR: "127.0.0.1", PGSERVICE: "nonexistent-qa-service", PGOPTIONS: "-c default_transaction_read_only=on" });
    const result = await isolated({ query: "INSERT INTO qa_effects VALUES ($1) RETURNING value", params: ["격리 확인"] });
    expect(result.rows).toEqual([["격리 확인"]]);
    await execute({ query: "DELETE FROM qa_effects WHERE value = $1", params: ["격리 확인"] });
  });
});
