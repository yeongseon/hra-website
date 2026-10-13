/**
 * 서버가 소유권을 기록한 본문 이미지 중 참조가 없는 파일만 점검·정리합니다 (#88).
 * 기본은 읽기 전용 후보 보고입니다. 기존 미등록 Blob은 절대 대상으로 삼지 않습니다.
 * 실제 삭제는 콘텐츠 쓰기를 중단한 유지보수 시간에 --apply와 환경 플래그를 함께 지정합니다.
 */
import { del } from "@vercel/blob";
import { neon } from "@neondatabase/serverless";

const apply = process.argv.includes("--apply");
const unknown = process.argv.slice(2).filter((arg) => arg !== "--apply");
if (unknown.length > 0) {
  throw new Error(`지원하지 않는 인자: ${unknown.join(", ")}`);
}
if (apply && process.env.HRA_CONTENT_WRITES_STOPPED !== "1") {
  throw new Error("실제 삭제 전 콘텐츠 쓰기를 중단하고 HRA_CONTENT_WRITES_STOPPED=1을 설정해야 합니다.");
}
if (apply && !process.env.BLOB_READ_WRITE_TOKEN) {
  throw new Error("실제 삭제에는 BLOB_READ_WRITE_TOKEN이 필요합니다.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL 환경변수가 필요합니다.");
}

const sql = neon(process.env.DATABASE_URL);
const candidates = await sql`
  SELECT a.id, a.url, a.created_at
  FROM markdown_image_assets a
  WHERE a.deleted_at IS NULL
    AND a.created_at < now() - interval '30 days'
    AND NOT EXISTS (
      SELECT 1 FROM markdown_image_references r WHERE r.asset_id = a.id
    )
  ORDER BY a.created_at, a.id
  LIMIT 100
`;

console.log(`소유권 확인·30일 경과·현재 미참조 후보: ${candidates.length}개 (최대 100개)`);
if (!apply) {
  console.log("읽기 전용 점검 완료. 실제 파일은 삭제하지 않았습니다.");
  process.exit(0);
}

let deleted = 0;
let skipped = 0;
let failed = 0;
for (const candidate of candidates) {
  // 운영 쓰기 중단은 외부 조건입니다. 삭제 직전에도 현재 참조를 다시 확인해
  // 점검 이후 바뀐 레코드가 있으면 해당 파일을 보존합니다.
  const references = await sql`
    SELECT 1 FROM markdown_image_references
    WHERE asset_id = ${candidate.id}
    LIMIT 1
  `;
  if (references.length > 0) {
    skipped += 1;
    continue;
  }

  try {
    await del(candidate.url);
    await sql`
      UPDATE markdown_image_assets
      SET deleted_at = now()
      WHERE id = ${candidate.id} AND deleted_at IS NULL
    `;
    deleted += 1;
  } catch (error) {
    // SDK 오류 본문에는 URL/파일명이 들어갈 수 있으므로 메시지는 출력하지 않습니다.
    failed += 1;
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error(`이미지 원장 ID ${candidate.id} 정리 실패 (${name})`);
  }
}

console.log(`정리 완료: 삭제 ${deleted}개, 참조 확인으로 보존 ${skipped}개, 실패 ${failed}개`);
if (failed > 0) process.exitCode = 1;
