/**
 * Rate limit 테이블 및 인덱스 추가 마이그레이션 스크립트 (#69).
 *
 * 각 대상 테이블과 해당 인덱스를 개별 원자 트랜잭션으로 생성한다.
 *   1) login_attempts        — Credentials 로그인 시도 로그 (ip, email, attempted_at, success)
 *   2) upload_rate_limit_log — /api/upload-image 남용 방어용 로그 (ip, attempted_at)
 *
 * 원자성 범위 (중요):
 *   TARGETS 배열의 각 항목이 (CREATE TABLE + 인덱스들) 을 하나의 sql.transaction 으로
 *   묶어 실행한다. 즉 한 target 내부에서 인덱스 하나만 실패해도 그 target 은
 *   깨끗하게 롤백된다. 반면 두 target 사이 (login_attempts 성공 후
 *   upload_rate_limit_log 실패) 는 별도 트랜잭션이라 부분 반영 상태가 남을 수 있으나,
 *   CREATE ... IF NOT EXISTS 로 idempotent 하므로 재실행 시 clean slate 로 수렴한다.
 *
 * 스키마 (schema.ts:loginAttempts / uploadRateLimitLog 와 일치해야 함):
 *
 * login_attempts:
 *   - id            uuid PK DEFAULT gen_random_uuid()
 *   - ip            varchar(45)  NULL   -- IPv6 최대 길이 수용, UNKNOWN_IP fallback 가능
 *   - email         varchar(255) NULL   -- RFC 5321 최대, 이메일 없이 authorize 호출된 병리 대비
 *   - attempted_at  timestamptz  NOT NULL DEFAULT now()
 *   - success       boolean      NOT NULL
 * 인덱스:
 *   - idx_login_attempts_ip_attempted     (ip, attempted_at)      -- IP sliding window (credential stuffing)
 *   - idx_login_attempts_email_attempted  (email, attempted_at)   -- email sliding window (password spray)
 *
 * upload_rate_limit_log:
 *   - id            uuid PK DEFAULT gen_random_uuid()
 *   - ip            varchar(45)  NULL   -- UNKNOWN_IP fallback 가능
 *   - attempted_at  timestamptz  NOT NULL DEFAULT now()
 * 인덱스:
 *   - idx_upload_rate_limit_ip_attempted  (ip, attempted_at)
 *
 * 안전성:
 *   1. **idempotent**: 각 테이블·인덱스에 IF NOT EXISTS 사용, 재실행 안전.
 *   2. **동명 relation 사전 검사**: view/sequence 등 비-테이블 relation 이 같은 이름으로
 *      존재하면 fail loud (관리자가 수동으로 상황 파악해 정리하도록 유도).
 *   3. **사후 검증**: 최종 상태를 재확인 후 성공 처리.
 *   4. **저트래픽 신규 테이블**: 락 영향 없음.
 *
 * 사용법:
 *   npm run db:migrate-add-rate-limit-tables
 *
 * 환경변수:
 *   DATABASE_URL - Neon Postgres 연결 문자열 (필수)
 *
 * 왜 drizzle-kit push 를 쓰지 않는가:
 *   drizzle-kit push 는 대화형 프롬프트와 함께 schema.ts ↔ DB 전체 diff 를 적용하려
 *   시도한다. #79 (전체 diff 로 인한 UNIQUE drift 재발) 방지를 위해 이 스크립트는
 *   #69 스코프의 각 테이블과 해당 인덱스만 개별 트랜잭션으로 안전하게 처리한다.
 *
 * 후속 작업 (Phase 2, 별도 이슈):
 *   두 테이블 모두 무한 성장 특성이 있으므로 TTL 크론 필요.
 *   패턴 예시: DELETE FROM login_attempts WHERE attempted_at < now() - INTERVAL '1 day';
 *   Vercel Cron 또는 Neon TTL 이 도입되면 실행 주기·보존 기간을 이슈에서 확정한다.
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const SCHEMA_NAME = "public";

/**
 * 생성 대상 테이블 목록.
 * 각 항목은 CREATE TABLE 문(DDL)과 인덱스 배열을 갖는다.
 * DDL 은 정적 문자열이므로 sql.unsafe() 로 raw 전달해도 인젝션 리스크가 없다.
 */
const TARGETS = [
  {
    tableName: "login_attempts",
    createTable: `
      CREATE TABLE IF NOT EXISTS login_attempts (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ip           varchar(45),
        email        varchar(255),
        attempted_at timestamptz NOT NULL DEFAULT now(),
        success      boolean NOT NULL
      );
    `,
    indexes: [
      {
        name: "idx_login_attempts_ip_attempted",
        create: `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_attempted ON login_attempts (ip, attempted_at);`,
      },
      {
        name: "idx_login_attempts_email_attempted",
        create: `CREATE INDEX IF NOT EXISTS idx_login_attempts_email_attempted ON login_attempts (email, attempted_at);`,
      },
    ],
  },
  {
    tableName: "upload_rate_limit_log",
    createTable: `
      CREATE TABLE IF NOT EXISTS upload_rate_limit_log (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        ip           varchar(45),
        attempted_at timestamptz NOT NULL DEFAULT now()
      );
    `,
    indexes: [
      {
        name: "idx_upload_rate_limit_ip_attempted",
        create: `CREATE INDEX IF NOT EXISTS idx_upload_rate_limit_ip_attempted ON upload_rate_limit_log (ip, attempted_at);`,
      },
    ],
  },
];

/**
 * relation 종류 확인 헬퍼.
 * relkind='r' 은 ordinary table (view='v', index='i', sequence='S' 등 구분).
 */
async function relationKind(name) {
  const rows = await sql`
    SELECT c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ${name}
      AND n.nspname = ${SCHEMA_NAME};
  `;
  if (rows.length === 0) return null;
  return rows[0].relkind;
}

async function indexExists(indexName, tableName) {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM pg_indexes
    WHERE schemaname = ${SCHEMA_NAME}
      AND tablename = ${tableName}
      AND indexname = ${indexName};
  `;
  return rows[0].count > 0;
}

async function main() {
  console.log("🔐 rate limit 테이블 마이그레이션을 시작합니다...");

  for (const target of TARGETS) {
    console.log(`\n── ${target.tableName} ──`);

    // ── Step 1: 동명 non-table relation 사전 검사 ──────────────────────
    // 같은 이름의 view / sequence / matview 등이 이미 있다면 CREATE TABLE IF NOT EXISTS
    // 는 조용히 skip 하지만, 우리가 원하는 스키마가 아닐 수 있어 명시적으로 실패시킨다.
    const kind = await relationKind(target.tableName);
    if (kind !== null && kind !== "r") {
      console.error(
        `❌ ${SCHEMA_NAME}.${target.tableName} 이름의 non-table relation 이 존재합니다 (relkind=${kind}).`
      );
      console.error("   'r' (ordinary table) 이 아닌 다른 종류 (view/sequence 등) 입니다.");
      console.error("   수동으로 확인 후 정리하거나 다른 이름을 사용하도록 스키마를 조정하세요.");
      process.exit(1);
    }
    if (kind === "r") {
      console.log(`   테이블 ${target.tableName} 이 이미 존재합니다. 인덱스만 확인·추가합니다.`);
    }

    // ── Step 2 + 3: 테이블·인덱스 생성 (원자 트랜잭션, idempotent) ───
    // Neon HTTP 드라이버의 sql.transaction([...]) 은 배열로 넘긴 statement 들을
    // 하나의 non-interactive Postgres 트랜잭션으로 실행한다 (rollback on error).
    // 중간에 실패해도 부분 상태가 남지 않아 재시도 시 clean slate 를 보장한다.
    //   - gen_random_uuid() 는 Neon 기본 활성 (pgcrypto). 다른 UUID PK 컬럼들과
    //     동일 방식이라 별도 확장 활성화 불필요.
    //   - CREATE ... IF NOT EXISTS 는 Postgres 9.5+ 지원. Neon 은 훨씬 신 버전.
    //   - sql.unsafe(str) 는 NeonQueryPromise 를 반환하므로 배열에 그대로 삽입.
    await sql.transaction([
      sql.unsafe(target.createTable),
      ...target.indexes.map((idx) => sql.unsafe(idx.create)),
    ]);

    // ── Step 4: 사후 검증 ────────────────────────────────────────────
    const postKind = await relationKind(target.tableName);
    if (postKind !== "r") {
      throw new Error(`${target.tableName} 테이블 확인 실패 (relkind=${postKind}).`);
    }
    for (const idx of target.indexes) {
      if (!(await indexExists(idx.name, target.tableName))) {
        throw new Error(`${idx.name} 인덱스 확인 실패.`);
      }
    }
    console.log(`   ✅ ${target.tableName} + 인덱스 ${target.indexes.length}개 준비 완료.`);
  }

  console.log("\n✅ rate limit 테이블 마이그레이션이 성공적으로 완료되었습니다.");
  console.log("   이제 src/lib/rate-limit.ts 가 이 테이블을 기반으로 판정합니다.");
}

main().catch((error) => {
  console.error("❌ 마이그레이션 실행 중 오류가 발생했습니다:", error);
  process.exit(1);
});
