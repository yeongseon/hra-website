/**
 * OAuth provider binding 컬럼 추가 마이그레이션 스크립트 (#67)
 *
 * users 테이블에 다음을 추가한다.
 *   - oauth_provider text NULL
 *   - oauth_provider_account_id text NULL
 *   - UNIQUE (oauth_provider, oauth_provider_account_id) 복합 제약
 *   - CHECK (둘 다 NULL 이거나 둘 다 NOT NULL) 제약
 *
 * 사용 목적: signIn 콜백이 email 일치만으로 기존 사용자를 재인증하는 취약점을 봉쇄한다.
 *   provider + providerAccountId 튜플이 채워지면 이후 로그인은 이 튜플로만 재인증되고,
 *   같은 email 의 다른 provider 계정 (cross-provider account takeover) 은 차단된다.
 *
 * 안전성:
 *   - NULL 을 허용하므로 기존 row 는 데이터 손실 없이 마이그레이션된다.
 *   - UNIQUE (NULL, NULL) 은 Postgres 상 위반이 아니므로 legacy null/null row 는 공존한다.
 *   - CHECK 제약은 부분 채움 (한쪽만 NULL) row 를 스키마 레벨에서 차단한다.
 *   - ADD COLUMN 은 IF NOT EXISTS 로, ADD CONSTRAINT 는 information_schema 로 idempotent.
 *   - legacy null/null row 는 스키마 변경만으로는 재활성화되지 않는다. 로그인 경로에서
 *     block(legacy-unbound) 로 fail-closed 되며, 관리자가 DB 직접 수정 또는 신뢰 가능한
 *     과거 provider 데이터 기반 오프라인 backfill 스크립트로만 재활성화된다.
 *
 * 왜 drizzle-kit push 를 쓰지 않는가:
 *   drizzle-kit push 는 schema.ts 와 DB 전체 drift 를 한 번에 적용하려 하며 대화형 프롬프트가
 *   뜰 수 있어 CI/자동화 환경에서 불안하다. 이 스크립트는 #67 스코프만 원자적으로 처리한다.
 *
 * 사용법:
 *   npm run db:migrate-add-user-oauth-binding
 *   (또는) node --env-file=.env scripts/migrate-add-user-oauth-binding.mjs
 *
 * 환경변수:
 *   DATABASE_URL - Neon Postgres 연결 문자열 (필수)
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

async function main() {
  console.log("🔐 OAuth provider binding 컬럼 마이그레이션을 시작합니다...");

  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS oauth_provider text;
  `;

  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS oauth_provider_account_id text;
  `;

  // ADD CONSTRAINT 는 IF NOT EXISTS 를 직접 지원하지 않으므로 information_schema 로 확인 후 추가한다.
  const [{ count: uniqueCount }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.table_constraints
    WHERE table_name = 'users'
      AND constraint_name = 'users_oauth_binding_unique';
  `;

  if (uniqueCount === 0) {
    await sql`
      ALTER TABLE users
      ADD CONSTRAINT users_oauth_binding_unique UNIQUE (oauth_provider, oauth_provider_account_id);
    `;
    console.log("✅ users_oauth_binding_unique 제약을 추가했습니다.");
  } else {
    console.log("ℹ️  users_oauth_binding_unique 제약이 이미 존재합니다.");
  }

  const [{ count: checkCount }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.table_constraints
    WHERE table_name = 'users'
      AND constraint_name = 'users_oauth_binding_both_or_neither';
  `;

  if (checkCount === 0) {
    // CHECK 제약 추가 전 부분 채움 row 가 있는지 확인한다.
    // 스키마 정의만 따르면 발생 불가능하지만, 수동 SQL/시드/실패한 운영 스크립트로 남았을 수 있다.
    // 있으면 ALTER 가 CHECK 위반으로 실패하므로, 사전 감지해 관리자가 수동 정리하도록 안내한다.
    const [{ count: partialCount }] = await sql`
      SELECT COUNT(*)::int AS count
      FROM users
      WHERE (oauth_provider IS NULL AND oauth_provider_account_id IS NOT NULL)
         OR (oauth_provider IS NOT NULL AND oauth_provider_account_id IS NULL);
    `;
    if (partialCount > 0) {
      throw new Error(
        `부분 채움 (한쪽만 NULL) row 가 ${partialCount} 건 있어 CHECK 제약을 추가할 수 없습니다. ` +
          "수동으로 SELECT id, email, oauth_provider, oauth_provider_account_id FROM users " +
          "WHERE (oauth_provider IS NULL) <> (oauth_provider_account_id IS NULL); 로 확인 후 " +
          "튜플을 채우거나 두 값을 모두 NULL 로 되돌린 뒤 다시 실행하세요.",
      );
    }

    await sql`
      ALTER TABLE users
      ADD CONSTRAINT users_oauth_binding_both_or_neither
      CHECK (
        (oauth_provider IS NULL AND oauth_provider_account_id IS NULL)
        OR (oauth_provider IS NOT NULL AND oauth_provider_account_id IS NOT NULL)
      );
    `;
    console.log("✅ users_oauth_binding_both_or_neither 제약을 추가했습니다.");
  } else {
    console.log("ℹ️  users_oauth_binding_both_or_neither 제약이 이미 존재합니다.");
  }

  const [{ count: providerCount }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'oauth_provider';
  `;

  const [{ count: accountIdCount }] = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'oauth_provider_account_id';
  `;

  if (providerCount !== 1 || accountIdCount !== 1) {
    throw new Error(
      `users OAuth 컬럼 확인 실패 (provider=${providerCount}, accountId=${accountIdCount}).`,
    );
  }

  console.log("✅ users.oauth_provider / users.oauth_provider_account_id 컬럼이 준비되었습니다.");
  console.log(
    "ℹ️  legacy 소셜 계정 (binding null/null) 은 로그인 경로에서 block(legacy-unbound) 로 차단됩니다.",
  );
  console.log(
    "ℹ️  재활성화는 관리자가 DB 를 직접 수정하거나 신뢰 가능한 과거 provider 데이터 기반 오프라인 스크립트로만 가능합니다 (관리자 UI 액션 없음).",
  );
}

main().catch(error => {
  console.error("❌ 마이그레이션 실행 중 오류가 발생했습니다:", error);
  process.exit(1);
});
