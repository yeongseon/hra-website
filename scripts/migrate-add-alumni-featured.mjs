/**
 * 수료생 이야기 메인 노출 컬럼 추가 마이그레이션 스크립트
 *
 * alumni_stories 테이블에 is_featured 컬럼을 추가하여
 * 메인 페이지 배너 노출 여부를 관리자에서 제어할 수 있게 합니다.
 * 이미 컬럼이 존재하면 안전하게 건너뜁니다.
 *
 * 사용법:
 *   node scripts/migrate-add-alumni-featured.mjs
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
  console.log("🎓 수료생 이야기 메인 노출 컬럼 마이그레이션을 시작합니다...");

  await sql`
    ALTER TABLE alumni_stories
    ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;
  `;

  console.log("✅ alumni_stories.is_featured 컬럼이 준비되었습니다.");
}

main().catch((error) => {
  console.error("❌ 마이그레이션 실행 중 오류가 발생했습니다:", error);
  process.exit(1);
});
