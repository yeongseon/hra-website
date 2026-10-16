/**
 * DB 접근 권한을 가진 신뢰된 운영자의 학적 연결 도구입니다 (#145).
 * 웹 로그인 인증을 대신하지 않습니다. 별도 검증된 승인 계획만 적용합니다.
 * 기본은 읽기 전용이며 오류 원문·접속 문자열·개인정보를 출력하지 않습니다.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { z } from "zod/v4";
import { enrollmentPlanSchema } from "../src/features/academics/enrollments/plan.mjs";

// 값은 셸 명령이나 psql 인자로 삽입하지 않고 표준 입력의 SQL 리터럴로 전달합니다.
const literal = value => `'${value.replaceAll("'", "''")}'`;

function main() {
  const options = new Map();
  for (const arg of process.argv.slice(2)) {
    const match = /^(--(?:apply|dry-run)|--(?:plan|expect|confirm-target)=([^\n\r]+))$/.exec(arg);
    if (!match) throw new Error("지원하지 않는 인자입니다.");
    const key = arg.split("=")[0];
    if (options.has(key)) throw new Error("중복된 인자입니다.");
    options.set(key, match[2] ?? true);
  }
  const apply = options.has("--apply");
  if (apply && options.has("--dry-run")) throw new Error("실행 모드는 하나만 지정하세요.");
  const target = new URL(process.env.DATABASE_URL ?? "");
  if (!["postgres:", "postgresql:"].includes(target.protocol) || !target.hostname || target.pathname.length <= 1) {
    throw new Error("DB 주소를 확인하세요.");
  }
  // DB 대상 확인값은 비밀번호·URL을 포함하지 않는 해시입니다.
  const fingerprint = createHash("sha256").update(JSON.stringify([
    target.hostname, target.port || "5432", decodeURIComponent(target.pathname.slice(1)), decodeURIComponent(target.username),
  ])).digest("hex").slice(0, 16);
  console.log(`대상 확인값: ${fingerprint}`);
  const planPath = options.get("--plan");
  const plan = typeof planPath === "string"
    ? enrollmentPlanSchema.parse(JSON.parse(readFileSync(planPath, "utf8"))) : null;
  const approver = z.uuid().safeParse(process.env.ACADEMIC_APPROVER_USER_ID);
  if (apply && (!plan || !approver.success || plan.approverUserId !== approver.data ||
    process.env.ACADEMIC_ENROLLMENT_WRITES_ENABLED !== "true" ||
    options.get("--confirm-target") !== fingerprint ||
    !/^\d+$/.test(String(options.get("--expect"))) || Number(options.get("--expect")) !== plan.links.length)) {
    throw new Error("적용 조건이 충족되지 않았습니다.");
  }
  const pgEnvironment = {
    // PGHOSTADDR·PGSERVICE 등 상속 접속 옵션이 확인한 DB 대상을 바꾸지 못하게 합니다.
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("PG"))),
    PGHOST: target.hostname,
    PGPORT: target.port || "5432",
    PGUSER: decodeURIComponent(target.username),
    PGPASSWORD: decodeURIComponent(target.password),
    PGDATABASE: decodeURIComponent(target.pathname.slice(1)),
    PGSSLMODE: target.searchParams.get("sslmode") || "require",
    PGCHANNELBINDING: target.searchParams.get("channel_binding") || "prefer",
    PGCONNECT_TIMEOUT: "10",
    PGOPTIONS: "-c statement_timeout=30000 -c lock_timeout=10000 -c standard_conforming_strings=on",
  };
  let query = "BEGIN READ ONLY; SELECT public.inspect_academic_enrollment_candidates(); COMMIT;";
  if (apply) {
    query = `SELECT public.apply_academic_enrollment_links(${literal(approver.data)}::uuid,
      ${literal(approver.data)}::uuid, ${literal(JSON.stringify(plan))}::jsonb);`;
  } else if (plan) {
    // 계획의 ID만 대조하고 읽기 전용 트랜잭션에서 학생·등록을 생성하지 않습니다.
    query = `BEGIN READ ONLY;
      SELECT public.inspect_academic_enrollment_candidates();
      SELECT COALESCE(jsonb_agg(jsonb_build_object('studentId', p."studentId", 'userId', p."userId",
        'cohortId', p."cohortId", 'accountExists', u.id IS NOT NULL, 'studentExists', s.id IS NOT NULL,
        'cohortExists', c.id IS NOT NULL, 'accountStateMatches',
        u.role::text = p."expectedRole" AND u.cohort_id IS NOT DISTINCT FROM p."expectedCohortId",
        'linkCompatible', s.user_id IS NULL OR s.user_id = u.id,
        'accountAlreadyUsed', EXISTS (SELECT 1 FROM public.academic_students other
          WHERE other.user_id = u.id AND other.id <> s.id),
        'enrollmentExists', EXISTS (SELECT 1 FROM public.cohort_enrollments e
          WHERE e.student_id = s.id AND e.cohort_id = p."cohortId"))), '[]'::jsonb)
      FROM jsonb_to_recordset(${literal(JSON.stringify(plan.links))}::jsonb)
        AS p("studentId" uuid, "userId" uuid, "cohortId" uuid, "expectedRole" text, "expectedCohortId" uuid)
      LEFT JOIN public.users u ON u.id = p."userId"
      LEFT JOIN public.academic_students s ON s.id = p."studentId"
      LEFT JOIN public.cohorts c ON c.id = p."cohortId";
      COMMIT;`;
  }
  const result = spawnSync(process.env.HRA_PSQL_BIN || "psql", ["-X", "-qAt", "-v", "ON_ERROR_STOP=1"], {
    input: query, encoding: "utf8", env: pgEnvironment, maxBuffer: 5 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error("DB 검증 또는 적용이 거부되었습니다.");
  // DB 함수는 식별자와 건수만 반환합니다. stderr에는 SQL 값이 있어 출력하지 않습니다.
  console.log(result.stdout.trim());
  console.log(apply ? "승인 계획 적용 완료" : `읽기 전용 점검 완료${plan ? `: 계획 ${plan.links.length}건` : ""}`);
}

try {
  main();
} catch {
  // JSON·Zod·PostgreSQL 오류에는 원본 입력이 포함될 수 있어 정해진 메시지만 남깁니다.
  console.error("학적 도구를 완료하지 못했습니다. 실행 조건·승인 계획·DB 상태를 확인하세요.");
  process.exitCode = 1;
}
