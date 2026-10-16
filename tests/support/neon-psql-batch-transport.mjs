/**
 * 실제 Neon HTTP 배치를 하나의 격리 PostgreSQL 트랜잭션으로 실행하는 테스트 전용 전송기입니다.
 * 기존 단일 쿼리 전송기의 소켓 표식 검사·바인딩·CSV 처리를 재사용하며 운영 DB는 허용하지 않습니다.
 * 설치된 Neon 클라이언트의 { queries } 요청과 { results } 원시 텍스트 응답 계약을 따릅니다.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { bindParameters, createPsqlTransport, parseCsv, sqlLiteral } from "./neon-psql-transport.mjs";

/** SQL·값·접속 정보 대신 실제 SQLSTATE와 비민감 제약/고정 기계 코드만 보존합니다. */
function transportError(result) {
  const code = result.error?.code === "ETIMEDOUT" ? "QA_TRANSPORT_TIMEOUT"
    : result.stderr?.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] || "QA_TRANSPORT_ERROR";
  const constraint = result.stderr?.match(/(?:CONSTRAINT NAME:\s+|constraint ")([a-z_][a-z0-9_]{0,62})/)?.[1];
  const candidate = result.stderr?.match(/ERROR:\s+P0001:\s+([^\r\n]+)/)?.[1];
  const message = candidate && /^[a-z][a-z0-9_]{2,100}$/.test(candidate)
    ? candidate : "격리 PostgreSQL 배치 실행 실패";
  return Object.assign(new Error(message), { code, ...(constraint ? { constraint } : {}) });
}

/** Neon 배치 옵션은 정해진 SQL 상수로만 변환하며 잘못된 값을 묵인하지 않습니다. */
function transactionOptions(headers) {
  const values = new Headers(headers);
  const clauses = [];
  const isolation = values.get("Neon-Batch-Isolation-Level");
  if (isolation !== null) {
    // 설치된 SDK 타입은 PostgreSQL 공백 표기 대신 ReadCommitted 같은 이름을 전송합니다.
    const levels = new Map([
      ["ReadUncommitted", "READ UNCOMMITTED"], ["ReadCommitted", "READ COMMITTED"],
      ["RepeatableRead", "REPEATABLE READ"], ["Serializable", "SERIALIZABLE"],
    ]);
    const normalized = levels.get(isolation);
    if (!normalized) {
      throw new Error("격리 배치 격리 수준이 올바르지 않습니다.");
    }
    clauses.push(`ISOLATION LEVEL ${normalized}`);
  }
  for (const [name, yes, no] of [
    ["Neon-Batch-Read-Only", "READ ONLY", "READ WRITE"],
    ["Neon-Batch-Deferrable", "DEFERRABLE", "NOT DEFERRABLE"],
  ]) {
    const value = values.get(name);
    if (value !== null) {
      if (value !== "true" && value !== "false") throw new Error("격리 배치 옵션이 올바르지 않습니다.");
      clauses.push(value === "true" ? yes : no);
    }
  }
  return clauses.join(" ");
}

/**
 * 기본 전체 제한은 15초입니다. 테스트에서는 더 짧게 제한할 수 있으나 늘릴 수 없습니다.
 * 실패 시 ON_ERROR_STOP으로 psql 연결이 종료되므로 아직 열린 트랜잭션은 서버에서 롤백됩니다.
 */
export function createPsqlBatchTransport(environment, { timeoutMs = 15_000 } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15_000) {
    throw new Error("격리 배치 제한 시간은 1~15000밀리초여야 합니다.");
  }
  const isolated = Object.freeze({ ...environment });
  // 이 생성자는 실제 연결 없이 가짜 DATABASE_URL·DB명·유닉스 소켓·qa-scope 표식을 검증합니다.
  createPsqlTransport(isolated);
  const pgEnvironment = Object.fromEntries([
    "PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGSSLMODE", "PGCONNECT_TIMEOUT", "PGPASSWORD",
  ].filter(key => isolated[key] !== undefined).map(key => [key, isolated[key]]));
  const typeOids = new Map();

  return async (payload, headers) => {
    if (!payload || !Array.isArray(payload.queries) || payload.queries.length < 1 || payload.queries.length > 100) {
      throw new Error("격리 배치 쿼리 배열이 올바르지 않습니다.");
    }
    // SQL 입력으로 트랜잭션을 끝내거나 psql 메타 명령을 실행하는 경로를 허용하지 않습니다.
    const statements = payload.queries.map(item => {
      if (!item || typeof item !== "object") throw new Error("격리 배치 쿼리가 올바르지 않습니다.");
      const statement = bindParameters(item.query, item.params ?? []);
      if (!/^\s*(?:SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(statement)) {
        throw new Error("격리 배치는 앱의 조회·쓰기 문장만 허용합니다.");
      }
      return statement;
    });
    const options = transactionOptions(headers);
    const deadline = Date.now() + timeoutMs;
    const run = script => {
      const remaining = deadline - Date.now();
      if (remaining < 1) throw Object.assign(new Error("격리 PostgreSQL 배치 제한 시간 초과"), { code: "QA_TRANSPORT_TIMEOUT" });
      const result = spawnSync(join(isolated.HRA_TEST_PG_BIN, "psql"), [
        "-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-P", "footer=off",
      ], { input: script, encoding: "utf8", env: pgEnvironment,
        maxBuffer: 8 * 1024 * 1024, timeout: remaining });
      if (result.status !== 0 || result.error) throw transportError(result);
      return result.stdout;
    };
    const marker = randomUUID().replaceAll("-", "");
    const nullMarker = `qa_null_${marker}`;
    // 앱 SQL은 DDL을 허용하지 않습니다. 읽기 전용 Describe에서 결과 타입을 먼저 확인합니다.
    // 타입 조회가 실패했는데 실제 쓰기는 이미 커밋되는 상황을 막기 위해 모든 메타데이터를 선확보합니다.
    const descriptions = run(`BEGIN READ ONLY;\nSET LOCAL standard_conforming_strings = on;\n${statements.map((statement, index) =>
      `\\echo ${marker}_${index}_description\n${statement}\n\\gdesc\n\\echo ${marker}_${index}_description_end\n`).join("")}COMMIT;\n`);
    const prepared = statements.map((statement, index) => {
      const prefix = `${marker}_${index}`;
      const description = descriptions.split(`${prefix}_description\n`)[1]?.split(`${prefix}_description_end\n`)[0];
      if (description === undefined) throw new Error("격리 PostgreSQL 배치 타입 설명이 올바르지 않습니다.");
      return { statement, columns: description.startsWith("Column,Type\n") ? parseCsv(description).slice(1) : [] };
    });
    const missing = [...new Set(prepared.flatMap(result => result.columns.map(row => row[1].value)))].filter(name => !typeOids.has(name));
    if (missing.length) {
      const types = parseCsv(run(`BEGIN READ ONLY;\nSELECT ${missing.map(name => `(${sqlLiteral(name)}::regtype)::oid`).join(", ")};\nCOMMIT;\n`))[1];
      if (!types || types.length !== missing.length) throw new Error("격리 배치 결과 타입을 확인할 수 없습니다.");
      missing.forEach((name, index) => {
        const oid = Number(types[index].value);
        if (!Number.isInteger(oid) || oid < 1) throw new Error("격리 배치 결과 타입 OID가 올바르지 않습니다.");
        typeOids.set(name, oid);
      });
    }
    const fieldSets = prepared.map(({ columns }) => columns.map(([name, type]) => ({ name: name.value, dataTypeID: typeOids.get(type.value) })));
    // 실제 앱 문장 전부는 이 한 연결·트랜잭션에서 g로 정확히 한 번 실행합니다.
    // 이후 타입 OID 보조 연결은 열지 않으므로 그 조회 실패가 쓰기 커밋 뒤에 발생하지 않습니다.
    const output = run(`BEGIN ${options};\nSET LOCAL standard_conforming_strings = on;\n\\pset null ${nullMarker}\n${statements.map((statement, index) =>
      `\\echo ${marker}_${index}_rows\n${statement}\n\\g\n\\echo ${marker}_${index}_count :ROW_COUNT\n`).join("")}COMMIT;\n`);
    return { results: prepared.map(({ statement }, index) => {
      const prefix = `${marker}_${index}`;
      const body = output.split(`${prefix}_rows\n`)[1]?.split(`${prefix}_count `)[0];
      const count = output.match(new RegExp(`${prefix}_count ([0-9]+)`))?.[1];
      if (body === undefined || count === undefined) throw new Error("격리 PostgreSQL 배치 응답 구획이 올바르지 않습니다.");
      const fields = fieldSets[index];
      const rows = fields.length ? parseCsv(body).slice(1).map(row => row.map(cell =>
        !cell.quoted && cell.value === nullMarker ? null : cell.value)) : [];
      if (rows.some(row => row.length !== fields.length)) throw new Error("격리 PostgreSQL 배치 컬럼 수가 일치하지 않습니다.");
      return { fields, rows, rowCount: Number(count), command: statement.trim().match(/^[A-Za-z]+/)?.[0].toUpperCase() || "SELECT" };
    }) };
  };
}
