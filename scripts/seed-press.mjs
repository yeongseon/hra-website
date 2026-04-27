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
  // === 2026년 기사 ===
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
    title: "제주대 '취업역량강화 아카데미 동계 캠프' 운영",
    source: "뉴스라인제주",
    url: "http://www.newslinejeju.com/news/articleView.html?idxno=167238",
    publishedAt: "2026-02-18",
    description:
      "국립대학육성사업 지원으로 단기형·장기형(HRA 동계캠프) 교육과정 운영. 김일환 총장 'AI 시대, 대학 교육' 특강 진행.",
    order: 2,
  },
  {
    title: "제주대 '취업역량강화 아카데미 동계 캠프' 참여자 모집",
    source: "베리타스알파",
    url: "https://www.veritas-a.com/news/articleView.html?idxno=596971",
    publishedAt: "2026-02-04",
    description:
      "국립대학육성사업 일환. 장기 합숙형 교육 과정에 HRA 교수진 참여, 도내 대학생 및 지역 청년 대상 모집.",
    order: 3,
  },
  // === 2025년 기사 ===
  {
    title: "제주대 'HRA 18기 수료식 및 19기 입학식' 개최",
    source: "지금제주",
    url: "https://www.jigeumjeju.com/news/articleView.html?idxno=96046",
    publishedAt: "2025-09-29",
    description:
      "18기 학생 14명 수료 및 19기 입학식. 감사패 수여(KSS해운 박종규 명예회장, 롯데관광개발 김기병 회장). 2007년 시작 이래 19년간 운영.",
    order: 4,
  },
  {
    title: "제주대 'HRA 18기 수료식 및 19기 입학식' 개최",
    source: "베리타스알파",
    url: "https://www.veritas-a.com/news/articleView.html?idxno=575158",
    publishedAt: "2025-09-29",
    description:
      "18기 수료 및 19기 입학. 100권 고전 독서 토론, 경영 트렌드 학습, 현직자 멘토링, 기업 실무 프로젝트 등 역량 강화 커리큘럼 소개.",
    order: 5,
  },
  // === 2023년 기사 ===
  {
    title: "해외에서 선진 견문 넓히고 취업 역량 높인다",
    source: "제주일보",
    url: "https://www.jejunews.com/news/articleView.html?idxno=2207601",
    publishedAt: "2023-12-21",
    description:
      "JDC·제주대·위즈덤시티 HRA 16기 수료·17기 입학식 소개. 고전명작 읽기, 기업 실무 과정, 봉사활동, 인턴, 특강 등 6대 프로그램 운영.",
    order: 6,
  },
  // === 2022년 기사 ===
  {
    title: "제주대학교, JDC·(사)위즈덤시티와 HRA사업 공동추진 업무협약",
    source: "한국강사신문",
    url: "https://www.lecturernews.com/news/articleView.html?idxno=110899",
    publishedAt: "2022-11-03",
    description:
      "제주대·JDC·위즈덤시티 3자 업무협약. 강의·프로그램 운영, 사업비 관리, 시설 제공 등 HRA 사업 공동추진.",
    order: 7,
  },
  {
    title: "제주대-JDC-(사)위즈덤시티, HRA사업 공동추진 업무협약",
    source: "헤드라인제주",
    url: "https://www.headlinejeju.co.kr/news/articleView.html?idxno=499753",
    publishedAt: "2022-11-02",
    description:
      "도내 대학생 및 졸업생 대상 1년간 체계적 교육훈련. 업무능력·성품·사명감 3박자 갖춘 인재 양성 목표.",
    order: 8,
  },
  // === 2021년 기사 ===
  {
    title: "청년들의 길 안내서, HRA를 만나다",
    source: "제주대신문",
    url: "https://news.jejunu.ac.kr/news/articleView.html?idxno=15181",
    publishedAt: "2021-05-26",
    description: "HRA 15기 활동 소개 기사. 청년들의 성장과 도전 이야기를 담고 있습니다.",
    order: 9,
  },
  // === 2020년 기사 ===
  {
    title: "롯데관광개발-위즈덤시티, 지역 인재 육성 협력 협약식",
    source: "연합뉴스",
    url: "https://www.yna.co.kr/view/AKR20200512145400056",
    publishedAt: "2020-05-12",
    description:
      "롯데관광개발, HRA 대학생 대상 인턴십·진로 상담 후원 협약. 2007년 개소 이후 수료생 330명 배출.",
    order: 10,
  },
  // === 2017년 기사 ===
  {
    title: "제주대학교, '2017 청년드림 베스트 프랙티스 대학' 선정",
    source: "국민일보",
    url: "https://www.kmib.co.kr/article/view.asp?arcid=0011982704",
    publishedAt: "2017-12-14",
    description:
      "청년취업 역량강화 아카데미(HRA, Human Renaissance Academy)와 3C형 인재양성 프로그램 소개. 대학일자리센터와 (사)위즈덤시티 공동 운영.",
    order: 11,
  },
  // === 제주의소리 HRA 10주년 3부작 (2017) ===
  {
    title: '"지방대는 정보가 부족하다. 그래서 HRA를 만들었다"',
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=195784",
    publishedAt: "2017-10-04",
    description:
      "[HRA 10주년 3부] 김수종 전 한국일보 주필 인터뷰. 제주 지역 청년들의 정보 부족 해소를 위해 HRA를 만든 배경과 향후 '학생 자치' 프로그램 비전.",
    order: 12,
  },
  {
    title: "HRA를 이끈 숨은 힘? 재능기부자들의 헌신 있었다",
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=195592",
    publishedAt: "2017-10-02",
    description:
      "[HRA 10주년 2부] 후원자·재능기부자들의 10년간 헌신 조명. 전직 언론인·기업인·교수진 등 각계 시니어들의 재능기부와 노블레스 오블리주 정신.",
    order: 13,
  },
  {
    title: "10년 걸어온 HRA, 제주 청년인재 사관학교 역할 '톡톡'",
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=195521",
    publishedAt: "2017-09-30",
    description:
      "[HRA 10주년 1부] HRA 10년 발자취 조명. 1~7기 취업률 70%, 공무원·금융권·관광·언론 등 다양한 분야에서 활약하는 HRA 출신 인재들.",
    order: 14,
  },
  {
    title: "같이 손잡고 나아가는 HRA 값진 경험으로 제주의 리더 되길",
    source: "제주대신문",
    url: "https://news.jejunu.ac.kr/news/articleView.html?idxno=12384",
    publishedAt: "2017-09-27",
    description:
      "HRA 10기 수료식·11기 입학식 현장. 블랙야크 강태선 회장 장학금 전달, 허향진 총장 축사. 수료생 공연과 추억 영상 시청.",
    order: 15,
  },
  // === 뉴스1 HRA 10년사 시리즈 (2017) ===
  {
    title: "'텐트 스쿨'로 시작해 10년…그 뒤엔 후원자가 있었다",
    source: "뉴스1",
    url: "https://www.news1.kr/local/jeju/3110966",
    publishedAt: "2017-09-26",
    description:
      "[HRA 10년사 下] 제주도·제주대·후원회의 기부와 지원. 4차 산업혁명 시대 혁신적 교육모델로서 HRA 커리큘럼과 운영방식 소개.",
    order: 16,
  },
  {
    title: '"휴먼 르네상스 아카데미는 인생학교…배움에 감사"',
    source: "뉴스1",
    url: "https://www.news1.kr/local/jeju/3109679",
    publishedAt: "2017-09-24",
    description:
      "HRA 10기 수료·11기 입학식. 시니어 재능기부·후원으로 1년간 대학생 인재양성교육 진행.",
    order: 17,
  },
  // === 2016년 기사 ===
  {
    title: '"대학생끼리 인적네트워크 형성해야"',
    source: "제주대신문",
    url: "https://news.jejunu.ac.kr/news/articleView.html?idxno=11865",
    publishedAt: "2016-11-30",
    description:
      "김수종 전 한국일보 주필 인터뷰. HRA 10년, 100여 명의 교수·멘토·운영진 재능기부로 운영. 학생들의 인적네트워크 형성 강조.",
    order: 18,
  },
  {
    title: "취업, 한번에 쓱? 제주대 취업 특강 개설",
    source: "제주의소리",
    url: "https://www.jejusori.net/news/articleView.html?idxno=176885",
    publishedAt: "2016-04-20",
    description:
      "사단법인 위즈덤시티가 제주대학교와 대학생 취업 역량 향상을 위한 프로그램 개설·운영 소개.",
    order: 19,
  },
  // === 2013년 기사 ===
  {
    title: '"사회발전에 필요한 젊은 리더 육성"',
    source: "제민일보",
    url: "https://www.jemin.com/news/articleView.html?idxno=312616",
    publishedAt: "2013-06-30",
    description:
      "HRA 설립 배경과 운영 소개. 김수종 전 주필이 도내 인재 유출 문제 해결 위해 설립. 1~5기 120명 교육 이수, 6기 39명 수료 예정.",
    order: 20,
  },
  // === 2026년 추가 (뉴스N제주) ===
  {
    title: "제주대 '취업역량강화 아카데미 동계 캠프' 참여자 모집",
    source: "뉴스N제주",
    url: "https://www.newsnjeju.com/news/articleView.html?idxno=258300",
    publishedAt: "2026-02-04",
    description:
      "국립대학육성사업 일환. 단기 집중형·장기 합숙형(HRA 교수진 참여) 과정 구성. 도내 대학생 및 지역 청년 대상.",
    order: 21,
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
