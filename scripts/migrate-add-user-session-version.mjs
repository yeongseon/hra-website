/**
 * 사용자 세션 버전 컬럼 추가 마이그레이션 스크립트 (#68, #74)
 *
 * users 테이블에 session_version 컬럼을 추가하여 JWT 세션 무효화 기능을 활성화합니다.
 * role/cohort 변경 시 sessionVersion 을 +1 하여 stale 세션을 강제 로그아웃시키는 데 사용됩니다.
 *
 * 안전성:
 *   - NOT NULL DEFAULT 0 이므로 기존 row 는 자동으로 0 이 채워집니다 (데이터 손실 없음).
 *   - IF NOT EXISTS 로 idempotent 하게 실행할 수 있습니다.
 *   - 마이그레이션 이전 JWT 는 sessionVersion 필드가 없어 jwt 콜백에서
 *     첫 lookup 을 통과하고 그 자리에서 sessionVersion 이 심어져 자연스러운 backfill 이 이루어집니다.
 *
 * 사용법:
 *   node scripts/migrate-add-user-session-version.mjs
 *
 * 환경변수:
 *   DATABASE_URL - Neon Postgres 연결 문자열 (필수)
 *
 * 왜 drizzle-kit push 를 쓰지 않는가:
 *   drizzle-kit push 는 schema.ts 와 DB 를 비교해 모든 drift 를 한 번에 적용하려 하는데,
 *   대화형 프롬프트가 뜨는 경우 CI/자동화 환경에서 처리가 불가능하다. 이 스크립트는
 *   #68 스코프의 세션 버전 컬럼만 원자적으로 추가한다.
 *   (참고: #79 의 application_submissions UNIQUE drift 는
 *    `scripts/migrate-add-application-submissions-unique.mjs` 로 별도 해소되었다.)
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  console.log("🔐 사용자 세션 버전 컬럼 마이그레이션을 시작합니다...");

  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
  `;

  const [{ count }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'session_version';
  `;

  if (count !== 1) {
    throw new Error(
      `users.session_version 컬럼 확인에 실패했습니다 (count=${count}).`
    );
  }

  console.log("✅ users.session_version 컬럼이 준비되었습니다.");
}

main().catch((error) => {
  console.error("❌ 마이그레이션 실행 중 오류가 발생했습니다:", error);
  process.exit(1);
});
