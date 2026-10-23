/**
 * #121 요청 제한 예약 테이블·함수만 설치합니다.
 * 무인자 확인은 접속하지 않으며 명시 적용에서는 URL과 libpq 접속 설정을 일치시킵니다.
 * 비밀번호·사용자명·연결 문자열·psql 원문 출력은 작업 로그에 기록하지 않습니다.
 */
import { spawnSync } from "node:child_process";
import { isIP } from "node:net";
import { isAbsolute, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--confirm-apply")) {
  console.error("요청 제한 설치 인자를 확인하세요. [RATE_LIMIT_MIGRATION_ARGUMENTS]");
  process.exit(1);
}

let host, port, user, password, database, sslmode, channelBinding;
try {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error("MISSING_CONNECTION");
  const target = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(target.protocol) || target.hash) throw new Error("INVALID_CONNECTION");
  // 다중 host·service·hostaddr·options 등 별도 접속 경로는 조용히 무시하지 않고 거부합니다.
  const parameters = [...target.searchParams.keys()];
  if (new Set(parameters).size !== parameters.length || parameters.some(key => !["sslmode", "channel_binding"].includes(key))) throw new Error("INVALID_PARAMETERS");
  host = decodeURIComponent(target.hostname);
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
  const socket = isAbsolute(host) && normalize(host) === host && !/[\0\r\n,]/.test(host);
  if (!socket && isIP(host) !== 6 && !/^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/.test(host)) throw new Error("INVALID_HOST");
  port = target.port || "5432";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) throw new Error("INVALID_PORT");
  user = decodeURIComponent(target.username);
  password = decodeURIComponent(target.password);
  database = decodeURIComponent(target.pathname.slice(1));
  // 빈 자격은 OS 사용자·service·password file로 보완하지 않습니다. DB명은 conninfo 확장 문법을 허용하지 않습니다.
  if (!user || !password || /[\0\r\n]/.test(user + password) || !/^[a-zA-Z0-9_.-]{1,63}$/.test(database)) throw new Error("MISSING_CREDENTIALS");
  sslmode = target.searchParams.get("sslmode") ?? "require";
  channelBinding = target.searchParams.get("channel_binding") ?? "prefer";
  if (!["disable", "allow", "prefer", "require", "verify-ca", "verify-full"].includes(sslmode) || !["disable", "prefer", "require"].includes(channelBinding)) throw new Error("INVALID_SECURITY_POLICY");
} catch {
  console.error("명시적인 URL 자격·대상·접속 옵션을 확인하세요. [RATE_LIMIT_MIGRATION_TARGET_INVALID]");
  process.exit(1);
}

const displayHost = isAbsolute(host) ? "로컬 유닉스 소켓" : isIP(host) === 6 ? `[${host}]` : host;
console.log(`마이그레이션 대상: ${displayHost}:${port}/${database}`);
if (args.length === 0) {
  console.log("접속 없는 확인을 마쳤습니다. 적용하려면 --confirm-apply를 전달하세요.");
  process.exit(0);
}

const sqlFile = fileURLToPath(new URL("./sql/rate-limit-reservations.sql", import.meta.url));
// 부모 PG*·DATABASE_URL·Node 옵션·service 설정을 상속하지 않습니다.
// 필수 시스템 환경 외에는 검증한 URL 필드와 이 도구의 고정 제한만 전달합니다.
const pgEnvironment = {
  ...Object.fromEntries(["PATH", "HOME", "SYSTEMROOT", "TMPDIR", "TMP", "TEMP"].filter(key => process.env[key]).map(key => [key, process.env[key]])),
  LC_ALL: "C",
  PGHOST: host,
  PGPORT: port,
  PGUSER: user,
  PGPASSWORD: password,
  PGDATABASE: database,
  PGSSLMODE: sslmode,
  PGCHANNELBINDING: channelBinding,
  PGCONNECT_TIMEOUT: "10",
  PGGSSENCMODE: "disable",
  PGOPTIONS: "-c statement_timeout=60000 -c lock_timeout=5000 -c standard_conforming_strings=on",
};
const result = spawnSync(
  process.env.HRA_PSQL_BIN || "psql",
  ["-X", "-w", "-v", "ON_ERROR_STOP=1", "-f", sqlFile],
  {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    env: pgEnvironment,
    timeout: 90_000,
    killSignal: "SIGKILL",
    maxBuffer: 1024 * 1024,
  },
);
// libpq 오류에는 대상·사용자·SQL·비밀정보가 들어갈 수 있어 원문과 종료 원인을 모두 버립니다.
if (result.error || result.status !== 0) {
  console.error("요청 제한 예약 설치에 실패했습니다. [RATE_LIMIT_MIGRATION_FAILED]");
  process.exit(1);
}
console.log("요청 제한 예약 설치를 마쳤습니다. [RATE_LIMIT_MIGRATION_APPLIED]");
