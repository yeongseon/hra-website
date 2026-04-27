/**
 * 보고서 양식·가이드 시드 스크립트
 *
 * content/member/templates/ 및 content/member/guides/ 의 Markdown 파일을
 * DB report_templates 테이블에 입력합니다.
 * 이미 동일한 slug가 존재하면 건너뜁니다.
 *
 * 사용법:
 *   node scripts/seed-report-templates.mjs
 *
 * 환경변수:
 *   DATABASE_URL - Neon Postgres 연결 문자열 (필수)
 */

import { neon } from "@neondatabase/serverless";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const sql = neon(DATABASE_URL);

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  for (const line of match[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    meta[key] = value;
  }
  return { meta, body: match[2].trim() };
}

function deriveSlug(filename) {
  return filename.replace(/\.md$/, "");
}

async function seedFiles(dir, defaultCategory) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch {
    console.log(`⚠️  디렉터리 없음: ${dir}`);
    return;
  }

  for (const file of files) {
    const content = readFileSync(join(dir, file), "utf-8");
    const { meta, body } = parseFrontmatter(content);
    const slug = deriveSlug(file);
    const category = meta.category || defaultCategory;

    const existing = await sql`
      SELECT id FROM report_templates WHERE slug = ${slug} LIMIT 1
    `;
    if (existing.length > 0) {
      console.log(`⏭️  이미 존재: ${slug}`);
      continue;
    }

    await sql`
      INSERT INTO report_templates (slug, title, category, report_category, description, version, body, published, "order")
      VALUES (
        ${slug},
        ${meta.title || slug},
        ${category},
        ${meta.reportCategory || null},
        ${meta.description || null},
        ${meta.version || "1.0.0"},
        ${body},
        true,
        0
      )
    `;
    console.log(`✅ 시드 완료: ${slug} (${category})`);
  }
}

async function main() {
  console.log("🌱 보고서 양식·가이드 시드 시작...\n");

  await seedFiles("content/member/templates", "template");
  await seedFiles("content/member/guides", "guide");

  console.log("\n🎉 시드 완료!");
}

main().catch((err) => {
  console.error("❌ 시드 실패:", err);
  process.exit(1);
});
