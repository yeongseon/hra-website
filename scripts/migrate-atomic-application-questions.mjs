/**
 * 지원서 질문 저장 버전·단일 저장 함수·제출 버전 확인 함수를 설치한다 (#96, #98).
 * 컬럼 추가와 함수 교체는 Neon HTTP 원자적 배치로 함께 확정한다.
 */
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
}

const sql = neon(databaseUrl);
const functionSql = readFileSync(new URL("./migrate-atomic-application-questions.sql", import.meta.url), "utf8");
const revisionSql = readFileSync(new URL("./migrate-assert-application-question-revision.sql", import.meta.url), "utf8");

await sql.transaction([
  sql`ALTER TABLE application_forms ADD COLUMN IF NOT EXISTS questions_revision integer NOT NULL DEFAULT 0`,
  sql.query(functionSql),
  sql.query(revisionSql),
]);

const [result] = await sql`
  SELECT count(*)::integer AS count
  FROM information_schema.columns
  WHERE table_name = 'application_forms' AND column_name = 'questions_revision'
`;
if (result.count !== 1) {
  throw new Error("질문 저장 버전 컬럼을 확인하지 못했습니다.");
}
console.log("지원서 질문 저장 버전과 저장·제출 검증 함수가 준비되었습니다.");
