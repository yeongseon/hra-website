/**
 * #121 요청 제한 예약 테이블·함수만 설치합니다.
 * 확인 단계는 대상 호스트·DB명만 출력하며, --confirm-apply 전에는 DB를 변경하지 않습니다.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--confirm-apply")) {
  console.error("사용법: npm run db:migrate-rate-limit-reservations -- [--confirm-apply]");
  process.exit(1);
}

const connection = process.env.DATABASE_URL;
if (!connection) {
  console.error("DATABASE_URL이 설정되지 않았습니다.");
  process.exit(1);
}

let target;
try {
  target = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(target.protocol)) throw new Error("PostgreSQL 주소가 아닙니다.");
} catch {
  console.error("DATABASE_URL 형식이 올바르지 않습니다.");
  process.exit(1);
}

console.log(`마이그레이션 대상: ${target.hostname}/${target.pathname.replace(/^\//, "")}`);
if (args.length === 0) {
  console.log("읽기 전용 확인을 마쳤습니다. 적용하려면 --confirm-apply를 전달하세요.");
  process.exit(0);
}

const sqlFile = fileURLToPath(new URL("./sql/rate-limit-reservations.sql", import.meta.url));
// libpq의 PGDATABASE는 URL이 아니라 DB 이름입니다. 연결 문자열을 각 필드로 나눠
// 비밀번호가 명령 인자나 연결 실패 메시지에 포함되지 않게 합니다.
const pgEnvironment = {
  ...process.env,
  PGHOST: target.hostname,
  PGPORT: target.port || "5432",
  PGUSER: decodeURIComponent(target.username),
  PGPASSWORD: decodeURIComponent(target.password),
  PGDATABASE: decodeURIComponent(target.pathname.replace(/^\//, "")),
  PGSSLMODE: target.searchParams.get("sslmode") || "require",
  PGCHANNELBINDING: target.searchParams.get("channel_binding") || "prefer",
};
const result = spawnSync(
  process.env.HRA_PSQL_BIN || "psql",
  ["-X", "-v", "ON_ERROR_STOP=1", "-f", sqlFile],
  {
    stdio: "inherit",
    env: pgEnvironment,
  },
);
if (result.error) {
  console.error(`psql 실행 실패: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
