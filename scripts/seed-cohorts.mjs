/**
 * 기수 시드 스크립트
 *
 * 1기부터 19기까지의 기수 데이터를 cohorts 테이블에 입력합니다.
 * 이미 동일한 이름의 기수가 있으면 건너뜁니다.
 *
 * 사용법:
 *   node scripts/seed-cohorts.mjs
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

// /cohorts 페이지의 fallback 데이터를 그대로 옮긴 기수 데이터
const cohortsData = [
  { name: "19기", startDate: "2025-09-01T00:00:00.000Z", endDate: "2026-08-31T00:00:00.000Z", description: "새로운 도전을 향해 나아가는 19기", isActive: true, order: 19, recruitmentStatus: "OPEN" },
  { name: "18기", startDate: "2024-09-01T00:00:00.000Z", endDate: "2025-08-31T00:00:00.000Z", description: "함께 성장하며 미래를 그리다.", isActive: false, order: 18, recruitmentStatus: "CLOSED" },
  { name: "17기", startDate: "2023-09-01T00:00:00.000Z", endDate: "2024-08-31T00:00:00.000Z", description: "한계를 극복하고 성장으로 보답하다.", isActive: false, order: 17, recruitmentStatus: "CLOSED" },
  { name: "16기", startDate: "2022-09-01T00:00:00.000Z", endDate: "2023-08-31T00:00:00.000Z", description: "변화를 주도하는 혁신가들.", isActive: false, order: 16, recruitmentStatus: "CLOSED" },
  { name: "15기", startDate: "2021-09-01T00:00:00.000Z", endDate: "2022-08-31T00:00:00.000Z", description: "열정과 끈기로 내일을 열다.", isActive: false, order: 15, recruitmentStatus: "CLOSED" },
  { name: "14기", startDate: "2020-09-01T00:00:00.000Z", endDate: "2021-08-31T00:00:00.000Z", description: "어려움 속에서도 빛나는 연대.", isActive: false, order: 14, recruitmentStatus: "CLOSED" },
  { name: "13기", startDate: "2019-09-01T00:00:00.000Z", endDate: "2020-08-31T00:00:00.000Z", description: "다양성이 만드는 시너지.", isActive: false, order: 13, recruitmentStatus: "CLOSED" },
  { name: "12기", startDate: "2018-09-01T00:00:00.000Z", endDate: "2019-08-31T00:00:00.000Z", description: "질문하고 탐구하며 나아가다.", isActive: false, order: 12, recruitmentStatus: "CLOSED" },
  { name: "11기", startDate: "2017-09-01T00:00:00.000Z", endDate: "2018-08-31T00:00:00.000Z", description: "세상을 바꾸는 작은 발걸음.", isActive: false, order: 11, recruitmentStatus: "CLOSED" },
  { name: "10기", startDate: "2016-09-01T00:00:00.000Z", endDate: "2017-08-31T00:00:00.000Z", description: "10년의 발자취, 새로운 도약.", isActive: false, order: 10, recruitmentStatus: "CLOSED" },
  { name: "9기", startDate: "2015-09-01T00:00:00.000Z", endDate: "2016-08-31T00:00:00.000Z", description: "틀을 깨고 세상을 연결하다.", isActive: false, order: 9, recruitmentStatus: "CLOSED" },
  { name: "8기", startDate: "2014-09-01T00:00:00.000Z", endDate: "2015-08-31T00:00:00.000Z", description: "지식과 경험의 공유.", isActive: false, order: 8, recruitmentStatus: "CLOSED" },
  { name: "7기", startDate: "2013-09-01T00:00:00.000Z", endDate: "2014-08-31T00:00:00.000Z", description: "협력을 통한 상생의 길.", isActive: false, order: 7, recruitmentStatus: "CLOSED" },
  { name: "6기", startDate: "2012-09-01T00:00:00.000Z", endDate: "2013-08-31T00:00:00.000Z", description: "미래를 디자인하는 사람들.", isActive: false, order: 6, recruitmentStatus: "CLOSED" },
  { name: "5기", startDate: "2011-09-01T00:00:00.000Z", endDate: "2012-08-31T00:00:00.000Z", description: "창의적 사고로 세상을 보다.", isActive: false, order: 5, recruitmentStatus: "CLOSED" },
  { name: "4기", startDate: "2010-09-01T00:00:00.000Z", endDate: "2011-08-31T00:00:00.000Z", description: "도전하는 용기, 성취하는 기쁨.", isActive: false, order: 4, recruitmentStatus: "CLOSED" },
  { name: "3기", startDate: "2009-09-01T00:00:00.000Z", endDate: "2010-08-31T00:00:00.000Z", description: "더 나은 사회를 위한 발판.", isActive: false, order: 3, recruitmentStatus: "CLOSED" },
  { name: "2기", startDate: "2008-09-01T00:00:00.000Z", endDate: "2009-08-31T00:00:00.000Z", description: "지성의 연대, 행동하는 지성.", isActive: false, order: 2, recruitmentStatus: "CLOSED" },
  { name: "1기", startDate: "2007-09-01T00:00:00.000Z", endDate: "2008-08-31T00:00:00.000Z", description: "HRA의 첫걸음, 역사의 시작.", isActive: false, order: 1, recruitmentStatus: "CLOSED" },
];

async function main() {
  console.log("🎓 기수 시드 데이터 입력을 시작합니다...\n");

  let inserted = 0;
  let skipped = 0;

  for (const cohort of cohortsData) {
    // 동일한 이름의 기수가 이미 있는지 먼저 확인합니다.
    const existing = await sql`
      SELECT id FROM cohorts WHERE name = ${cohort.name}
    `;

    if (existing.length > 0) {
      console.log(`  ⏭️  ${cohort.name} - 이미 존재, 건너뜀`);
      skipped++;
      continue;
    }

    // 기수 기본 정보와 모집 상태를 함께 입력합니다.
    await sql`
      INSERT INTO cohorts (
        id,
        name,
        description,
        start_date,
        end_date,
        recruitment_status,
        is_active,
        "order",
        created_at,
        updated_at
      )
      VALUES (
        gen_random_uuid(),
        ${cohort.name},
        ${cohort.description},
        ${cohort.startDate},
        ${cohort.endDate},
        ${cohort.recruitmentStatus},
        ${cohort.isActive},
        ${cohort.order},
        NOW(),
        NOW()
      )
    `;

    console.log(`  ✅ ${cohort.name} 입력 완료`);
    inserted++;
  }

  console.log(`\n🎉 완료! 입력: ${inserted}기, 건너뜀: ${skipped}기`);
}

main().catch((err) => {
  console.error("❌ 시드 실행 중 오류 발생:", err);
  process.exit(1);
});
