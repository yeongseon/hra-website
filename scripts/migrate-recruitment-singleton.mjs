/**
 * 모집설정에 고정 키 CHECK/UNIQUE를 추가한다 (#99).
 * 기존 행이 여러 개면 어느 값이 정본인지 자동 추정하지 않고 변경 전에 중단한다.
 */
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
const sql = neon(databaseUrl);

const existing = await sql`
  SELECT id, updated_at
  FROM recruitment_settings
  ORDER BY updated_at DESC NULLS LAST, id DESC
`;
if (existing.length > 1) {
  throw new Error(
    `모집설정이 ${existing.length}행입니다. 최신 updated_at, 동률이면 id 역순을 우선 검토하되 ` +
    "모든 섹션 값을 비교해 보존할 행을 수동 결정한 뒤 다시 실행하세요. 이 스크립트는 행을 삭제하지 않습니다."
  );
}

// ALTER·제약·기본 행 생성은 하나의 트랜잭션으로 확정한다.
// 사전 확인 뒤 다른 연결이 중복 행을 넣으면 UNIQUE 생성이 실패해 전체가 롤백된다.
await sql.transaction([
  sql`ALTER TABLE recruitment_settings ADD COLUMN IF NOT EXISTS singleton_key integer NOT NULL DEFAULT 1`,
  sql.query(`DO $do$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recruitment_settings_singleton_key_unique'
          AND conrelid = 'recruitment_settings'::regclass
      ) THEN
        ALTER TABLE recruitment_settings
          ADD CONSTRAINT recruitment_settings_singleton_key_unique UNIQUE (singleton_key);
      END IF;
    END;
  $do$`),
  sql.query(`DO $do$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'recruitment_settings_singleton_key_check'
          AND conrelid = 'recruitment_settings'::regclass
      ) THEN
        ALTER TABLE recruitment_settings
          ADD CONSTRAINT recruitment_settings_singleton_key_check CHECK (singleton_key = 1);
      END IF;
    END;
  $do$`),
  sql`INSERT INTO recruitment_settings (singleton_key) VALUES (1) ON CONFLICT (singleton_key) DO NOTHING`,
]);

const [result] = await sql`
  SELECT count(*)::integer AS count,
         count(*) FILTER (WHERE singleton_key = 1)::integer AS valid_count
  FROM recruitment_settings
`;
if (result.count !== 1 || result.valid_count !== 1) {
  throw new Error("모집설정 단일 행 검증에 실패했습니다.");
}
console.log("모집설정 단일 행 제약과 기본 행이 준비되었습니다.");
