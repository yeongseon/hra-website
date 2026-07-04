/**
 * application_submissions UNIQUE 제약 추가 마이그레이션 스크립트 (#79)
 *
 * `application_submissions` 테이블에 `(form_id, applicant_email)` 복합 UNIQUE 제약을 추가합니다.
 * 이 제약은 동일 이메일이 같은 양식에 두 번 제출되는 것을 DB 레벨에서 원자적으로 차단하며,
 * 애플리케이션 코드(`src/features/applications/actions/submissions.ts:222`)가 이를 전제로
 * TOCTOU race 방지 로직을 구현하고 있습니다.
 *
 * 배경 (#79):
 *   커밋 `25070b9` 에서 `schema.ts` 에 이 제약이 추가되었지만 `drizzle-kit push` 가
 *   실행되지 않은 채 배포되어 프로덕션 DB 와 schema.ts 간 drift 가 발생했습니다.
 *   결과: `drizzle-kit push` 실행 시마다 대화형 프롬프트가 뜨고, 실제로는 애플리케이션
 *   코드가 기대하는 원자적 dedup 이 DB 레벨에서 보장되지 않는 상태였습니다.
 *
 * 안전성:
 *   1. **idempotent (Step 1)**: 제약이 이미 존재하면 즉시 종료 (재실행 안전).
 *   2. **이름 충돌 사전 검사 (Step 1b)**: 동일 이름의 relation (예: 별도로 만들어진 UNIQUE INDEX)
 *      이 있으면 fail loud. `ALTER TABLE ADD CONSTRAINT` 는 IF NOT EXISTS 를 지원하지 않으며
 *      42P07(duplicate_table) 로 실패하기 때문에 사전에 명시적 안내가 낫습니다.
 *   3. **동일 컬럼 조합의 다른 UNIQUE index 검사 (Step 1c)**: 앱 코드는 특정 constraint 이름
 *      매칭에 의존하므로(23505 catch + name check), 다른 이름의 UNIQUE index 가 같은 컬럼
 *      조합을 이미 커버하고 있으면 정리 후 재실행하도록 유도합니다.
 *   4. **중복 사전 검사 (Step 2)**: `(form_id, applicant_email)` 중복 row 가 있으면 fail loud.
 *      자동 삭제하지 않는 이유는, 적법한 중복 접수(예: 재제출 요청)인지 봇 스팸인지는
 *      관리자만 판단할 수 있기 때문입니다.
 *   5. **race-safe ALTER (Step 3)**: 두 관리자가 동시에 실행할 경우 첫 실행은 성공하고
 *      두 번째는 42710/42P07 을 받습니다. try/catch 로 이를 재검증 후 성공 처리해 운영
 *      경험도 idempotent 하게 만듭니다.
 *   6. **락 영향 최소**: `ALTER TABLE ADD CONSTRAINT UNIQUE` 는 ACCESS EXCLUSIVE 락을 잡지만,
 *      `application_submissions` 는 저트래픽 테이블(2026-06 기준 프로덕션 row 2 개)이라
 *      실질 영향이 거의 없습니다.
 *
 * 사용법:
 *   npm run db:migrate-add-application-unique
 *   (내부적으로: node --env-file=.env scripts/migrate-add-application-submissions-unique.mjs)
 *
 * 환경변수:
 *   DATABASE_URL - Neon Postgres 연결 문자열 (필수)
 *
 * 왜 drizzle-kit push 를 쓰지 않는가:
 *   drizzle-kit push 는 대화형 프롬프트 (테이블 truncate 여부 등) 를 띄우고, 프로덕션에
 *   존재하지 않는 다른 drift 까지 함께 반영하려 시도합니다. 이 스크립트는 #79 스코프만
 *   원자적으로 처리하며, 프로덕션 데이터의 중복을 자동 파괴하지 않고 관리자가 검토하도록
 *   fail loud 합니다.
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

// 제약 이름은 schema.ts 의 `unique("application_submissions_form_applicant_unique")` 와 정확히 일치해야
// 애플리케이션 코드의 `isUniqueViolation(error, "application_submissions_form_applicant_unique")` 가
// 동작합니다 (src/features/applications/actions/submissions.ts:222).
const CONSTRAINT_NAME = "application_submissions_form_applicant_unique";
const TABLE_NAME = "application_submissions";
const SCHEMA_NAME = "public";

// Postgres 에러 코드 (https://www.postgresql.org/docs/current/errcodes-appendix.html)
const PG_DUPLICATE_OBJECT = "42710"; // 동명 제약이 이미 존재 (constraint name clash)
const PG_DUPLICATE_TABLE = "42P07"; // 동명 relation 이 이미 존재 (index name clash)

/**
 * 제약이 이미 존재하는지 확인합니다.
 * 다중 schema 환경 오탐 방지를 위해 `table_schema` 필터를 반드시 포함합니다.
 */
async function constraintExists() {
  const rows = await sql`
    SELECT COUNT(*)::int AS count
    FROM information_schema.table_constraints
    WHERE table_schema = ${SCHEMA_NAME}
      AND table_name = ${TABLE_NAME}
      AND constraint_name = ${CONSTRAINT_NAME}
      AND constraint_type = 'UNIQUE';
  `;
  return rows[0].count > 0;
}

async function main() {
  console.log("🔐 application_submissions UNIQUE 제약 마이그레이션을 시작합니다...");

  // ── Step 1: 제약이 이미 존재하는지 확인 (idempotent) ──────────────────
  if (await constraintExists()) {
    console.log(`✅ 이미 존재: ${CONSTRAINT_NAME}. 추가 작업 없이 종료합니다.`);
    return;
  }

  // ── Step 1b: 동일 이름의 relation 존재 여부 확인 ──────────────────────
  // 누군가 이전에 `CREATE UNIQUE INDEX application_submissions_form_applicant_unique ON ...`
  // 형태로 표준 constraint 대신 index 만 만들어 두었을 수 있습니다. 이 경우
  // ADD CONSTRAINT 는 42P07 로 실패하므로 사전에 명시적으로 실패시켜 안내합니다.
  const sameNameRelation = await sql`
    SELECT c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = ${CONSTRAINT_NAME}
      AND n.nspname = ${SCHEMA_NAME};
  `;
  if (sameNameRelation.length > 0) {
    console.error(
      `❌ ${CONSTRAINT_NAME} 이름의 relation 이 이미 존재합니다 (relkind=${sameNameRelation[0].relkind}).`
    );
    console.error("   앱이 기대하는 UNIQUE constraint 형태로 재구성하려면:");
    console.error(`   DROP INDEX IF EXISTS ${SCHEMA_NAME}.${CONSTRAINT_NAME};`);
    console.error("   실행 후 이 스크립트를 재실행하세요.");
    process.exit(1);
  }

  // ── Step 1c: 다른 이름의 UNIQUE index 가 동일 컬럼 조합에 존재하는지 ──
  // 앱 코드는 constraint 이름 매칭(`isUniqueViolation(..., CONSTRAINT_NAME)`) 에
  // 의존하므로, 다른 이름의 UNIQUE index 가 같은 (form_id, applicant_email) 을
  // 커버하고 있으면 우리가 새로 추가할 constraint 는 중복 index 를 생성해 낭비이며,
  // 앱은 다른 이름의 23505 를 받아 특정 오류 메시지를 매칭하지 못하게 됩니다.
  //
  // 쿼리 설명:
  //   - `pg_index.indkey` 는 table 의 attnum 배열. attname 으로 역변환 후 정렬 비교.
  //   - `attname` 은 name 타입 → text 로 캐스팅하여 배열 비교 안정화.
  //   - expression index (indkey 에 0 포함) 는 `attnum = ANY(indkey)` 매칭에서 제외됨.
  const otherUniqueIndex = await sql`
    SELECT c.relname AS index_name
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = tbl.relnamespace
    WHERE tbl.relname = ${TABLE_NAME}
      AND n.nspname = ${SCHEMA_NAME}
      AND i.indisunique = TRUE
      AND (
        SELECT array_agg(a.attname::text ORDER BY a.attname::text)
        FROM pg_attribute a
        WHERE a.attrelid = tbl.oid
          AND a.attnum = ANY(i.indkey)
      ) = ARRAY['applicant_email', 'form_id']::text[];
  `;
  if (otherUniqueIndex.length > 0) {
    console.error(
      `❌ 동일 컬럼 조합의 다른 UNIQUE index 가 이미 존재합니다: ${otherUniqueIndex[0].index_name}`
    );
    console.error(
      "   앱은 constraint 이름 매칭에 의존하므로, 기존 index 를 정리하고 재실행하세요:"
    );
    console.error(`   DROP INDEX IF EXISTS ${SCHEMA_NAME}.${otherUniqueIndex[0].index_name};`);
    console.error("   그 후 이 스크립트를 재실행하세요.");
    process.exit(1);
  }

  // ── Step 2: (form_id, applicant_email) 중복 row 사전 검사 ─────────────
  // UNIQUE 제약은 기존 데이터에 중복이 있으면 추가 자체가 실패합니다.
  // 여기서 미리 감지해 관리자가 검토·처리할 수 있게 상세 정보를 출력합니다.
  const duplicates = await sql`
    SELECT form_id, applicant_email, COUNT(*)::int AS dup_count
    FROM ${sql.unsafe(TABLE_NAME)}
    GROUP BY form_id, applicant_email
    HAVING COUNT(*) > 1
    ORDER BY dup_count DESC, applicant_email;
  `;

  if (duplicates.length > 0) {
    console.error(
      `❌ ${duplicates.length} 건의 (form_id, applicant_email) 중복이 발견되었습니다.`
    );
    console.error("   자동 삭제는 데이터 손실 위험이 있어 수행하지 않습니다.");
    console.error("   아래 목록을 검토한 뒤 원하는 row 를 수동으로 정리해주세요:\n");
    for (const dup of duplicates) {
      console.error(
        `   • form_id=${dup.form_id}, applicant_email=${dup.applicant_email}, count=${dup.dup_count}`
      );
    }
    console.error("\n   중복 상세 조회 예시:");
    console.error("   SELECT id, applicant_name, submitted_at, status");
    console.error(`   FROM ${TABLE_NAME}`);
    console.error("   WHERE (form_id, applicant_email) IN (");
    console.error("     SELECT form_id, applicant_email");
    console.error(`     FROM ${TABLE_NAME}`);
    console.error("     GROUP BY 1, 2");
    console.error("     HAVING COUNT(*) > 1");
    console.error("   )");
    console.error("   ORDER BY form_id, applicant_email, submitted_at;");
    console.error(
      "\n   원하는 row 만 남기고 나머지를 DELETE 한 뒤 이 스크립트를 재실행하세요."
    );
    process.exit(1);
  }

  console.log("   중복 없음 확인. UNIQUE 제약을 추가합니다...");

  // ── Step 3: UNIQUE 제약 추가 (race-safe) ──────────────────────────────
  // ALTER TABLE ADD CONSTRAINT 는 Postgres 에서 IF NOT EXISTS 를 지원하지 않으므로
  // Step 1 의 pre-check 가 일반적인 idempotency 를 담당합니다.
  //
  // 다만 두 관리자가 동시에 실행할 경우, 둘 다 Step 1 을 통과하고 첫 번째만 성공,
  // 두 번째는 42710(constraint 동명) 또는 42P07(index 동명) 로 실패할 수 있습니다.
  // 이 경우 DB 상태는 이미 우리가 원하는 상태이므로, 사후 verify 로 확인 후 성공 처리합니다.
  //
  // 컬럼/제약 이름은 SQL 식별자로 정적이며 인젝션 위험이 없어 sql.unsafe() 로 raw SQL 로
  // 흐르게 합니다 (tagged template 파라미터는 값에만 적용됨).
  try {
    await sql`
      ALTER TABLE ${sql.unsafe(TABLE_NAME)}
      ADD CONSTRAINT ${sql.unsafe(CONSTRAINT_NAME)}
      UNIQUE (form_id, applicant_email);
    `;
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? /** @type {{ code: unknown }} */ (error).code
        : undefined;
    if (code === PG_DUPLICATE_OBJECT || code === PG_DUPLICATE_TABLE) {
      // 동시 실행 시나리오: 다른 세션이 먼저 추가했을 가능성. 재검증 후 성공 처리.
      if (await constraintExists()) {
        console.log(
          `✅ 다른 세션이 먼저 ${CONSTRAINT_NAME} 을 추가한 것을 확인. 정상 종료합니다.`
        );
        return;
      }
    }
    throw error;
  }

  // ── Step 4: 사후 검증 ────────────────────────────────────────────────
  // 실제로 제약이 추가되었는지 재확인해 마이그레이션 성공 여부를 명확히 판정합니다.
  if (!(await constraintExists())) {
    throw new Error(
      `${CONSTRAINT_NAME} 제약 확인에 실패했습니다 (사후 verify 에서 발견되지 않음).`
    );
  }

  console.log(`✅ ${CONSTRAINT_NAME} 제약이 성공적으로 추가되었습니다.`);
  console.log(
    "   이제 애플리케이션 코드의 원자적 dedup(23505 catch) 로직이 DB 레벨에서 보장됩니다."
  );
}

main().catch((error) => {
  console.error("❌ 마이그레이션 실행 중 오류가 발생했습니다:", error);
  process.exit(1);
});
