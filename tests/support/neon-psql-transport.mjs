/**
 * 실제 앱의 Neon HTTP 요청을 임시 PostgreSQL에 전달하는 QA 전용 전송 계층입니다.
 * 인증·인가·SQL 결과를 모킹하지 않으며, 가짜 .invalid 호스트와 격리 소켓만 허용합니다.
 * psql 출력은 메모리에서만 처리하고 SQL·연결 정보가 담긴 오류는 밖으로 전달하지 않습니다.
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

// Neon 1.2의 기본 application_name 추가로 정확한 연결 헤더 검사가 달라지지 않도록 명시합니다.
// 합성 QA 주소만 바꾸며, 외부 연결·다른 DB를 거부하는 기존 전체 문자열 비교는 유지합니다.
export const qaDatabaseUrl = "postgresql://hra_resource_qa:test-only@ep-resource-qa.resource-qa.invalid/hra_resource_qa?application_name=hra-resource-qa";
// schema installer는 bootstrap 관리 계정과 분리된 실제 비슈퍼유저 로그인만 사용합니다.
export const qaSchemaOperatorDatabaseUrl = "postgresql://hra_schema_operator:test-only@ep-resource-qa.resource-qa.invalid/hra_resource_qa?application_name=hra-resource-qa";
// 설치된 Neon 클라이언트는 첫 DNS 라벨을 api로 바꿔 HTTP 엔드포인트를 만듭니다.
export const qaNeonEndpoint = "https://api.resource-qa.invalid/sql";

/** CSV의 따옴표·줄바꿈·중복 컬럼을 배열로 보존합니다. */
export function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false, inQuotes = false, begun = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inQuotes) {
      if (character === '"' && text[index + 1] === '"') { value += '"'; index++; }
      else if (character === '"') inQuotes = false;
      else value += character;
    } else if (character === '"' && !begun) {
      quoted = true; inQuotes = true; begun = true;
    } else if (character === "," || character === "\n") {
      row.push({ value, quoted }); value = ""; quoted = false; begun = false;
      if (character === "\n") { rows.push(row); row = []; }
    } else {
      value += character; begun = true;
    }
  }
  if (inQuotes) throw new Error("격리 CSV 응답이 올바르지 않습니다.");
  if (begun || row.length) { row.push({ value, quoted }); rows.push(row); }
  return rows;
}

/** standard_conforming_strings=on에서 단일 SQL 값으로만 해석되게 인용합니다. */
export function sqlLiteral(value) {
  if (value === null) return "NULL";
  if (!["string", "number", "boolean"].includes(typeof value) ||
      (typeof value === "number" && !Number.isFinite(value)) || String(value).includes("\0")) {
    throw new Error("격리 쿼리 매개변수가 올바르지 않습니다.");
  }
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** 인용 문자열·식별자·주석 내부의 $n은 그대로 두고 바깥 매개변수만 바인딩합니다. */
export function bindParameters(query, params) {
  if (typeof query !== "string" || !Array.isArray(params) || query.includes("\0")) {
    throw new Error("격리 쿼리 형식이 올바르지 않습니다.");
  }
  let output = "", index = 0, blockDepth = 0;
  while (index < query.length) {
    const rest = query.slice(index);
    if (rest.startsWith("--")) {
      const end = query.indexOf("\n", index);
      output += end < 0 ? rest : query.slice(index, end + 1);
      index = end < 0 ? query.length : end + 1; continue;
    }
    if (rest.startsWith("/*")) {
      let end = index; blockDepth = 1; end += 2;
      while (end < query.length && blockDepth) {
        if (query.startsWith("/*", end)) { blockDepth++; end += 2; }
        else if (query.startsWith("*/", end)) { blockDepth--; end += 2; }
        else end++;
      }
      if (blockDepth) throw new Error("격리 쿼리 주석이 닫히지 않았습니다.");
      output += query.slice(index, end); index = end; continue;
    }
    const dollar = rest.match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0];
    if (dollar) {
      const end = query.indexOf(dollar, index + dollar.length);
      if (end < 0) throw new Error("격리 쿼리 문자열이 닫히지 않았습니다.");
      output += query.slice(index, end + dollar.length); index = end + dollar.length; continue;
    }
    const quote = query[index];
    if (quote === "'" || quote === '"') {
      const escaped = quote === "'" && /(?:^|[^A-Za-z0-9_])E$/i.test(query.slice(0, index));
      let end = index + 1, closed = false;
      for (; end < query.length; end++) {
        if (escaped && query[end] === "\\") { end++; continue; }
        if (query[end] === quote && query[end + 1] === quote) { end++; continue; }
        if (query[end] === quote) { end++; closed = true; break; }
      }
      if (!closed) throw new Error("격리 쿼리 인용이 닫히지 않았습니다.");
      output += query.slice(index, end); index = end; continue;
    }
    const parameter = rest.match(/^\$([1-9][0-9]*)/);
    if (parameter) {
      const position = Number(parameter[1]) - 1;
      if (position >= params.length) throw new Error("격리 쿼리 매개변수가 부족합니다.");
      output += sqlLiteral(params[position]); index += parameter[0].length; continue;
    }
    // psql 메타 명령과 다중 SQL은 앱의 단일 쿼리 전송 계약에 포함되지 않습니다.
    if (quote === "\\" || (quote === ";" && query.slice(index + 1).trim())) {
      throw new Error("격리 전송은 단일 SQL만 허용합니다.");
    }
    if (quote !== ";") output += quote;
    index++;
  }
  return output;
}

/** 임시 클러스터의 일치하는 표식·소켓·DB 이름을 확인한 뒤에만 psql을 실행합니다. */
export function createPsqlTransport(environment) {
  const root = environment.HRA_RESOURCE_QA_ROOT;
  const exactQaIdentity = environment.DATABASE_URL === qaDatabaseUrl && environment.PGUSER === "hra_resource_qa";
  const exactOperatorIdentity = environment.DATABASE_URL === qaSchemaOperatorDatabaseUrl && environment.PGUSER === "hra_schema_operator";
  if (!root || !environment.HRA_TEST_PG_BIN || !(exactQaIdentity || exactOperatorIdentity) ||
      environment.PGDATABASE !== "hra_resource_qa" ||
      environment.PGSSLMODE !== "disable") throw new Error("격리 PostgreSQL 실행 범위가 아닙니다.");
  const scope = JSON.parse(readFileSync(join(root, "qa-scope.json"), "utf8"));
  if (realpathSync(environment.PGHOST) !== realpathSync(root) ||
      scope.port !== environment.PGPORT || scope.root !== realpathSync(root)) {
    throw new Error("격리 PostgreSQL 실행 표식이 일치하지 않습니다.");
  }
  // PGHOSTADDR·PGSERVICE·PGOPTIONS가 검증한 유닉스 소켓 연결을 덮어쓰지 못하게 한다.
  const pgEnvironment = Object.fromEntries([
    "PGHOST", "PGPORT", "PGUSER", "PGDATABASE", "PGSSLMODE", "PGCONNECT_TIMEOUT", "PGPASSWORD",
  ].filter((key) => environment[key] !== undefined).map((key) => [key, environment[key]]));
  const run = (script) => {
    const result = spawnSync(join(environment.HRA_TEST_PG_BIN, "psql"),
      ["-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose", "-P", "footer=off"], {
        input: script, encoding: "utf8", env: pgEnvironment,
        maxBuffer: 8 * 1024 * 1024, timeout: 15_000,
      });
    if (result.status !== 0 || result.error) {
      // 원문 오류는 보관하지 않는다. 실제 Neon 클라이언트의 분기에 필요한 비민감 필드만 남긴다.
      const code = result.stderr?.match(/ERROR:\s+([0-9A-Z]{5}):/)?.[1] || "QA_TRANSPORT_ERROR";
      const constraint = result.stderr?.match(/(?:CONSTRAINT NAME:\s+|constraint ")([a-z_][a-z0-9_]{0,62})/)?.[1];
      const candidate = result.stderr?.match(/ERROR:\s+P0001:\s+([^\r\n]+)/)?.[1];
      const message = candidate && /^[a-z][a-z0-9_]{2,100}$/.test(candidate)
        ? candidate : "격리 PostgreSQL 쿼리 실행 실패";
      throw Object.assign(new Error(message), { code, ...(constraint ? { constraint } : {}) });
    }
    return result.stdout;
  };
  const typeOids = new Map();
  /** @param {{ query: string, params?: (string | number | boolean | null)[] }} payload */
  return async ({ query, params = [] }) => {
    const statement = bindParameters(query, params);
    const marker = randomUUID().replaceAll("-", "");
    const nullMarker = `qa_null_${marker}`;
    // \gdesc는 SQL을 실행하지 않고 Describe만 수행합니다. 함수·DELETE는 뒤의 \g에서 한 번만 실행됩니다.
    const output = run(`BEGIN;\nSET LOCAL standard_conforming_strings = on;\n\\pset null ${nullMarker}\n\\echo ${marker}_description\n${statement}\n\\gdesc\n\\echo ${marker}_rows\n${statement}\n\\g\n\\echo ${marker}_count :ROW_COUNT\nCOMMIT;\n`);
    const description = output.split(`${marker}_description\n`)[1]?.split(`${marker}_rows\n`)[0];
    const body = output.split(`${marker}_rows\n`)[1]?.split(`${marker}_count `)[0];
    const count = output.match(new RegExp(`${marker}_count ([0-9]+)`))?.[1];
    if (description === undefined || body === undefined || count === undefined) {
      throw new Error("격리 PostgreSQL 응답 구획이 올바르지 않습니다.");
    }
    const described = description.startsWith("Column,Type\n") ? parseCsv(description).slice(1) : [];
    const missing = [...new Set(described.map((row) => row[1].value))].filter((name) => !typeOids.has(name));
    if (missing.length) {
      const types = parseCsv(run(`SELECT ${missing.map((name) => `(${sqlLiteral(name)}::regtype)::oid`).join(", ")};\n`))[1];
      missing.forEach((name, index) => typeOids.set(name, Number(types[index].value)));
    }
    const fields = described.map(([name, type]) => ({ name: name.value, dataTypeID: typeOids.get(type.value) }));
    const rows = fields.length ? parseCsv(body).slice(1).map((row) => row.map((cell) =>
      !cell.quoted && cell.value === nullMarker ? null : cell.value)) : [];
    if (rows.some((row) => row.length !== fields.length)) throw new Error("격리 PostgreSQL 컬럼 수가 일치하지 않습니다.");
    return { fields, rows, rowCount: Number(count), command: statement.trim().match(/^[A-Za-z]+/)?.[0].toUpperCase() || "SELECT" };
  };
}
