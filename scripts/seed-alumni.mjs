/**
 * 수료생 이야기 시드 스크립트
 *
 * alumni/page.tsx에 하드코딩된 3명의 수료생 데이터를 DB에 입력합니다.
 * 이미 동일한 이름이 존재하면 건너뜁니다.
 *
 * 사용법:
 *   node scripts/seed-alumni.mjs
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

const alumniData = [
  {
    name: "17기 수료생",
    title: null,
    quote: "한계까지 도전하고, 성장으로 보답하다",
    content:
      "HRA에서의 1년은 단순한 교육이 아닌, 삶의 전환점이었습니다. 고전 읽기와 토론을 통해 깊이 사고하는 법을 배웠고, 케이스 스터디를 통해 실제 문제를 해결하는 역량을 키웠습니다.",
    isFeatured: true,
    order: 1,
  },
  {
    name: "18기 수료생",
    title: null,
    quote: "본질을 묻는 힘, 현업에서의 차이를 만들다",
    content:
      "HRA에서 배운 본질적 사고력은 직장에서도 큰 차이를 만들어 주었습니다. 문제의 표면이 아닌 근본을 파악하는 습관이 자연스럽게 업무에 녹아들었습니다.",
    isFeatured: true,
    order: 2,
  },
  {
    name: "19기 수료생",
    title: null,
    quote: "평생을 함께할 최고의 동료들을 얻었습니다",
    content:
      "HRA에서 가장 값진 것은 함께 성장한 동료들입니다. 매주 토요일 함께 고민하고 토론하며 쌓은 유대는 수료 후에도 계속되고 있습니다.",
    isFeatured: true,
    order: 3,
  },
];

async function main() {
  console.log("📖 수료생 이야기 시드 데이터 입력을 시작합니다...\n");

  let inserted = 0;
  let skipped = 0;

  for (const story of alumniData) {
    const existing = await sql`
      SELECT id FROM alumni_stories WHERE name = ${story.name}
    `;

    if (existing.length > 0) {
      console.log(`  ⏭️  ${story.name} - 이미 존재, 건너뜀`);
      skipped++;
      continue;
    }

    await sql`
      INSERT INTO alumni_stories (id, name, title, quote, content, is_featured, "order", created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${story.name},
        ${story.title},
        ${story.quote},
        ${story.content},
        ${story.isFeatured},
        ${story.order},
        NOW(),
        NOW()
      )
    `;

    console.log(`  ✅ ${story.name} 입력 완료`);
    inserted++;
  }

  console.log(`\n🎉 완료! 입력: ${inserted}건, 건너뜀: ${skipped}건`);
}

main().catch((err) => {
  console.error("❌ 시드 실행 중 오류 발생:", err);
  process.exit(1);
});
