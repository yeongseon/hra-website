/**
 * 언론보도 시드 스크립트
 *
 * docs/PRESS-ARTICLES.md에서 확인된 4건의 실제 언론 기사를 DB에 입력합니다.
 * 이미 동일한 URL이 존재하면 건너뜁니다.
 *
 * 사용법:
 *   node scripts/seed-press.mjs
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

const pressData = [
  {
    title: "제주대, 청년 취업역량강화 아카데미 'HRA', 20기 참여자 모집",
    source: "교수신문",
    url: "https://www.kyosu.net/news/articleView.html?idxno=203971",
    publishedAt: "2026-04-16",
    description:
      "주관: (사)위즈덤시티, 후원: 제주대학교 진로취업과·대학일자리플러스센터, JDC, 롯데관광개발. 20기 모집 안내 및 HRA 오픈클래스 소개.",
    order: 1,
  },
  {
    title: "청년들의 길 안내서, HRA를 만나다",
    source: "제주대신문",
    url: "https://news.jejunu.ac.kr/news/articleView.html?idxno=15181",
    publishedAt: "2021-05-26",
    description: "HRA 15기 활동 소개 기사. 청년들의 성장과 도전 이야기를 담고 있습니다.",
    order: 2,
  },
  {
    title: "제주대학교, '2017 청년드림 베스트 프랙티스 대학' 선정",
    source: "국민일보",
    url: "https://www.kmib.co.kr/article/view.asp?arcid=0011982704",
    publishedAt: "2017-12-14",
    description:
      "청년취업 역량강화 아카데미(HRA, Human Renaissance Academy)와 3C형 인재양성 프로그램 소개. 대학일자리센터와 (사)위즈덤시티 공동 운영.",
    order: 3,
  },
  {
    title: "취업, 한번에 쓱? 제주대 취업 특강 개설",
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=176885",
    publishedAt: "2016-04-20",
    description:
      "사단법인 위즈덤시티가 제주대학교와 대학생 취업 역량 향상을 위한 프로그램 개설·운영 소개.",
    order: 4,
  },
];

async function main() {
  console.log("📰 언론보도 시드 데이터 입력을 시작합니다...\n");

  let inserted = 0;
  let skipped = 0;

  for (const article of pressData) {
    const existing = await sql`
      SELECT id FROM press_articles WHERE url = ${article.url}
    `;

    if (existing.length > 0) {
      console.log(`  ⏭️  ${article.title} - 이미 존재, 건너뜀`);
      skipped++;
      continue;
    }

    await sql`
      INSERT INTO press_articles (id, title, source, url, published_at, description, "order", created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${article.title},
        ${article.source},
        ${article.url},
        ${article.publishedAt}::timestamp,
        ${article.description},
        ${article.order},
        NOW(),
        NOW()
      )
    `;

    console.log(`  ✅ ${article.source} - ${article.title} 입력 완료`);
    inserted++;
  }

  console.log(`\n🎉 완료! 입력: ${inserted}건, 건너뜀: ${skipped}건`);
}

main().catch((err) => {
  console.error("❌ 시드 실행 중 오류 발생:", err);
  process.exit(1);
});
