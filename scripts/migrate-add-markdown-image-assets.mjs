/**
 * 본문 이미지 소유권 원장만 추가하는 재실행 가능한 마이그레이션 (#88).
 * 기존 Blob URL에는 소유권을 소급 부여하지 않습니다.
 * 운영 DB에서는 사전 점검과 승인 후 실행해야 합니다.
 */
import { neon } from "@neondatabase/serverless";
import { readFileSync } from "node:fs";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL 환경변수가 필요합니다.");
}

const sql = neon(databaseUrl);
const referencesView = readFileSync(new URL("./sql/markdown-image-references.sql", import.meta.url), "utf8");

const relation = await sql`
  SELECT c.relkind
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'markdown_image_assets'
`;
if (relation.length > 0 && relation[0].relkind !== "r") {
  throw new Error("markdown_image_assets 이름에 테이블이 아닌 객체가 있습니다.");
}

await sql.transaction([
  sql`
    CREATE TABLE IF NOT EXISTS markdown_image_assets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      url text NOT NULL UNIQUE,
      uploaded_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      deleted_at timestamptz
    )
  `,
  sql`
    CREATE INDEX IF NOT EXISTS idx_markdown_image_assets_created_at
    ON markdown_image_assets (created_at)
  `,
  // unsafe()는 원시 SQL 조각이므로 템플릿 쿼리로 감싸 트랜잭션에 전달합니다.
  sql`${sql.unsafe(referencesView)}`,
]);

const columns = await sql`
  SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'markdown_image_assets'
`;
const actual = new Set(columns.map((row) => row.column_name));
for (const column of ["id", "url", "uploaded_by_id", "created_at", "deleted_at"]) {
  if (!actual.has(column)) {
    throw new Error(`markdown_image_assets.${column} 확인 실패`);
  }
}

const view = await sql`
  SELECT 1 FROM information_schema.views
  WHERE table_schema = 'public' AND table_name = 'markdown_image_references'
`;
if (view.length !== 1) {
  throw new Error("markdown_image_references 뷰 확인 실패");
}

console.log("markdown_image_assets 테이블과 참조 뷰 확인 완료");
