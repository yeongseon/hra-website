/**
 * 교수진 시드 스크립트
 *
 * 교수진 명단.md 파일의 21명 교수진 데이터를 DB에 입력합니다.
 * 이미 동일한 이름+카테고리 조합이 존재하면 건너뜁니다.
 *
 * 사용법:
 *   node scripts/seed-faculty.mjs
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

// 교수진 명단.md 기반 데이터
const facultyData = [
  // ── 고전 명작 (CLASSICS) ──
  { name: "김경희", category: "CLASSICS", currentPosition: null, formerPosition: "유니세프한국위원회 사무차장, 중앙일보·동아일보 기자, 스웨덴 스톡홀름대학교 국제대학원 수료", order: 1 },
  { name: "김수종", category: "CLASSICS", currentPosition: "칼럼니스트", formerPosition: "한국일보 기자·뉴욕특파원·논설위원·주필", order: 2 },
  { name: "신현덕", category: "CLASSICS", currentPosition: "신 교수의 돌씨앗농장 대표", formerPosition: "국민대학교 교수, 국민일보 대기자, 경인방송 사장", order: 3 },
  { name: "유재원", category: "CLASSICS", currentPosition: "외국어대학교 명예교수", formerPosition: null, order: 4 },
  { name: "이계성", category: "CLASSICS", currentPosition: null, formerPosition: "국회의장 정무수석, 한국일보 편집국장·논설실장", order: 5 },
  { name: "임재윤", category: "CLASSICS", currentPosition: null, formerPosition: "제주대학교 전파정보통신공학과 교수, 제주대학교 취업전략본부 본부장", order: 6 },
  { name: "권오숙", category: "CLASSICS", currentPosition: "한국 외국어대학교 초빙 교수", formerPosition: null, order: 7 },
  { name: "조운찬", category: "CLASSICS", currentPosition: null, formerPosition: "경향신문 베이징특파원·문화부장·논설위원", order: 8 },

  // ── 케이스 스터디 (BUSINESS) ──
  { name: "강대현", category: "BUSINESS", currentPosition: "GNTI ㈜ 대표", formerPosition: "하이마트 상품본부장, 대우 스페인법인장·해외사업본부장", order: 1 },
  { name: "박용기", category: "BUSINESS", currentPosition: null, formerPosition: "크라운제과 ㈜ 상근감사, 우리은행 영업본부장", order: 2 },
  { name: "이갑수", category: "BUSINESS", currentPosition: "드림드림 사회적기업 협동조합 이사", formerPosition: "우리은행 지점장", order: 3 },
  { name: "이미경", category: "BUSINESS", currentPosition: "산업정책연구원 연구교수, TRIWORKS inc. ㈜, 사단법인LETS 대표이사", formerPosition: "㈜세바스틴 한국법인 총괄이사", order: 4 },
  { name: "최영선", category: "BUSINESS", currentPosition: "Microsoft Korea 매니저", formerPosition: "SAP Labs Korea 개발자, 티맥스소프트 선임연구원", order: 5 },
  { name: "이순섭", category: "BUSINESS", currentPosition: "JP임팩트(주) 회장", formerPosition: "유한D&S 대표이사, 유한킴벌리 영업본부장", order: 6 },
  { name: "임규관", category: "BUSINESS", currentPosition: "숭실대 겸임교수", formerPosition: "한국IBM총괄실장, SK텔레콤 솔루션 사업본부장", order: 7 },

  // ── 특강 (LECTURE) ──
  { name: "진성희", category: "LECTURE", currentPosition: "정림건축 전략기획실 소장, 한국코치협회(KPC) 프로코치", formerPosition: "KBS 아나운서", order: 1 },
  { name: "이평래", category: "LECTURE", currentPosition: null, formerPosition: "한국외국어대학교 중앙아시아연구소 초빙연구원, 한국외국어대학교 중앙아시아연구소 교수", order: 2 },
  { name: "오연정", category: "LECTURE", currentPosition: null, formerPosition: "동시통역 번역 프리랜서", order: 3 },
  { name: "김성연", category: "LECTURE", currentPosition: "AWS 분석 스페셜리스트 솔루션즈 아키텍트", formerPosition: null, order: 4 },
  { name: "박성규", category: "LECTURE", currentPosition: "정림건축 인재개발팀장", formerPosition: "리얼워크 리더십 및 코칭연구소장", order: 5 },
  { name: "양혜연", category: "LECTURE", currentPosition: "제주대학교 외래교수", formerPosition: null, order: 6 },
];

async function main() {
  console.log("🎓 교수진 시드 데이터 입력을 시작합니다...\n");

  let inserted = 0;
  let skipped = 0;

  for (const member of facultyData) {
    // 동일한 이름+카테고리 조합이 이미 존재하는지 확인
    const existing = await sql`
      SELECT id FROM faculty WHERE name = ${member.name} AND category = ${member.category}
    `;

    if (existing.length > 0) {
      console.log(`  ⏭️  ${member.name} (${member.category}) - 이미 존재, 건너뜀`);
      skipped++;
      continue;
    }

    await sql`
      INSERT INTO faculty (id, name, category, current_position, former_position, "order", created_at, updated_at)
      VALUES (
        gen_random_uuid(),
        ${member.name},
        ${member.category},
        ${member.currentPosition},
        ${member.formerPosition},
        ${member.order},
        NOW(),
        NOW()
      )
    `;

    console.log(`  ✅ ${member.name} (${member.category}) 입력 완료`);
    inserted++;
  }

  console.log(`\n🎉 완료! 입력: ${inserted}명, 건너뜀: ${skipped}명`);
}

main().catch((err) => {
  console.error("❌ 시드 실행 중 오류 발생:", err);
  process.exit(1);
});
