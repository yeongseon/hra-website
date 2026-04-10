import type { Metadata } from "next";
import { asc } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { faculty } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "교수진 소개 | HRA",
  description: "HRA의 교육을 이끄는 교수진을 소개합니다.",
};

export const dynamic = "force-dynamic";

type FacultyCategory = "CLASSICS" | "BUSINESS" | "LECTURE";

type FacultyMember = {
  id: string;
  name: string;
  category: FacultyCategory;
  currentPosition: string | null;
  formerPosition: string | null;
  imageUrl: string | null;
  order: number;
};

const fallbackClassicReading: FacultyMember[] = [
  { id: "fallback-classics-1", name: "김경희", category: "CLASSICS", currentPosition: null, formerPosition: "유니세프한국위원회 사무차장, 중앙일보·동아일보 기자", imageUrl: null, order: 1 },
  { id: "fallback-classics-2", name: "김수종", category: "CLASSICS", currentPosition: "뉴스1 칼럼니스트", formerPosition: "한국일보 기자·뉴욕특파원·논설위원·주필", imageUrl: null, order: 2 },
  { id: "fallback-classics-3", name: "신현덕", category: "CLASSICS", currentPosition: "신 교수의 돌씨앗농장 대표", formerPosition: "국민대학교 교수, 국민일보 대기자, 경인방송 사장", imageUrl: null, order: 3 },
  { id: "fallback-classics-4", name: "유재원", category: "CLASSICS", currentPosition: "외국어대학교 명예교수", formerPosition: null, imageUrl: null, order: 4 },
  { id: "fallback-classics-5", name: "이계성", category: "CLASSICS", currentPosition: null, formerPosition: "국회의장 정무수석보좌관, 한국일보 편집국장·논설실장", imageUrl: null, order: 5 },
  { id: "fallback-classics-6", name: "임재윤", category: "CLASSICS", currentPosition: null, formerPosition: "제주대학교 전파정보통신공학과 교수, 취업전략본부 본부장", imageUrl: null, order: 6 },
  { id: "fallback-classics-7", name: "권오숙", category: "CLASSICS", currentPosition: "외국어대학교 교수", formerPosition: null, imageUrl: null, order: 7 },
  { id: "fallback-classics-8", name: "조운찬", category: "CLASSICS", currentPosition: null, formerPosition: "경향신문 베이징특파원·문화부장·논설위원", imageUrl: null, order: 8 },
];

const fallbackBusinessPractice: FacultyMember[] = [
  { id: "fallback-business-1", name: "강대현", category: "BUSINESS", currentPosition: "GNTI(주) 대표", formerPosition: "하이마트 상품본부장, 대우전자 스페인법인장·해외사업본부장", imageUrl: null, order: 1 },
  { id: "fallback-business-2", name: "박용기", category: "BUSINESS", currentPosition: null, formerPosition: "크라운제과(주) 상근감사, 우리은행 영업본부장", imageUrl: null, order: 2 },
  { id: "fallback-business-3", name: "이갑수", category: "BUSINESS", currentPosition: "드림드림 사회적기업 협동조합 이사", formerPosition: "우리은행 지점장", imageUrl: null, order: 3 },
  { id: "fallback-business-4", name: "이미경", category: "BUSINESS", currentPosition: "산업정책연구원 연구교수, 사단법인LETS 대표이사", formerPosition: "㈜세바스틴 한국법인 총괄이사", imageUrl: null, order: 4 },
  { id: "fallback-business-5", name: "이순섭", category: "BUSINESS", currentPosition: "JP임팩트(주) 회장", formerPosition: "유한D&S 대표이사, 유한킴벌리 영업본부장", imageUrl: null, order: 5 },
  { id: "fallback-business-6", name: "최영선", category: "BUSINESS", currentPosition: "Microsoft Korea 매니저", formerPosition: "SAP Labs Korea 개발자, 티맥스소프트 선임연구원", imageUrl: null, order: 6 },
  { id: "fallback-business-7", name: "임규관", category: "BUSINESS", currentPosition: "숭실대 겸임교수", formerPosition: "한국IBM 총괄실장, SK텔레콤 솔루션 사업본부장", imageUrl: null, order: 7 },
];

const fallbackSpecialLecture: FacultyMember[] = [
  { id: "fallback-lecture-1", name: "진성희", category: "LECTURE", currentPosition: "정림건축 전략기획실 소장, 한국코치협회(KPC) 프로코치", formerPosition: "KBS 아나운서", imageUrl: null, order: 1 },
];

const fallbackFacultyByCategory: Record<FacultyCategory, FacultyMember[]> = {
  CLASSICS: fallbackClassicReading,
  BUSINESS: fallbackBusinessPractice,
  LECTURE: fallbackSpecialLecture,
};

const categoryLabels: Record<FacultyCategory, string> = {
  CLASSICS: "고전읽기",
  BUSINESS: "기업실무",
  LECTURE: "특강",
};

function FacultyList({ members }: { members: FacultyMember[] }) {
  if (members.length === 0) {
    return (
      <div className="rounded-2xl border border-[#D9D9D9] bg-white px-6 py-10 text-center text-sm text-[#666666] shadow-[var(--shadow-soft)] sm:text-base">
        등록된 교수진 정보가 없습니다.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[#D9D9D9] bg-white px-6 shadow-[var(--shadow-soft)]">
      {members.map((member) => (
        <div
          key={member.id}
          className="flex gap-6 border-b border-[#D9D9D9] py-6 last:border-0"
        >
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-blue-50 text-lg font-bold text-blue-600">
            {member.name.charAt(0)}
          </div>
          <div className="flex flex-col justify-center">
            <h3 className="mb-1 text-lg font-bold text-blue-600">{member.name}</h3>
            <div className="space-y-1 text-sm leading-relaxed text-[#1a1a1a] md:text-base">
              {member.currentPosition ? <p>(現) {member.currentPosition}</p> : null}
              {member.formerPosition ? <p>(前) {member.formerPosition}</p> : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function FacultyPage() {
  let allFaculty: FacultyMember[] = [];

  try {
    allFaculty = await db
      .select({
        id: faculty.id,
        name: faculty.name,
        category: faculty.category,
        currentPosition: faculty.currentPosition,
        formerPosition: faculty.formerPosition,
        imageUrl: faculty.imageUrl,
        order: faculty.order,
        createdAt: faculty.createdAt,
      })
      .from(faculty)
      .orderBy(asc(faculty.order), asc(faculty.createdAt))
      .then((rows) =>
        rows.map(({ createdAt: _createdAt, ...member }) => member)
      );
  } catch {
    allFaculty = [];
  }

  const classics = allFaculty.filter((member) => member.category === "CLASSICS");
  const business = allFaculty.filter((member) => member.category === "BUSINESS");
  const lecture = allFaculty.filter((member) => member.category === "LECTURE");

  const displayFacultyByCategory: Record<FacultyCategory, FacultyMember[]> = {
    CLASSICS: classics.length > 0 ? classics : fallbackFacultyByCategory.CLASSICS,
    BUSINESS: business.length > 0 ? business : fallbackFacultyByCategory.BUSINESS,
    LECTURE: lecture.length > 0 ? lecture : fallbackFacultyByCategory.LECTURE,
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 text-center sm:mb-14 sm:text-left">
        <Badge
          variant="outline"
          className="border-blue-300 bg-blue-50 text-blue-700"
        >
          HRA FACULTY
        </Badge>
        <h1 className="text-3xl font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl md:text-5xl">
          교수진 소개
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-[#666666] sm:mx-0 md:text-base">
          HRA의 교육을 이끄는 교수진을 소개합니다.
        </p>
      </section>

      <div className="space-y-12 sm:space-y-16">
        {(["CLASSICS", "BUSINESS", "LECTURE"] as const).map((category) => (
          <section key={category}>
            <div className="mb-6">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl">
                  {categoryLabels[category]}
                </h2>
                <Badge
                  variant="outline"
                  className="border-[#D9D9D9] bg-white text-[#666666]"
                >
                  {displayFacultyByCategory[category].length}명
                </Badge>
              </div>
              <div className="mt-3 h-0.5 w-full bg-blue-600" />
            </div>
            <FacultyList members={displayFacultyByCategory[category]} />
          </section>
        ))}
      </div>
    </div>
  );
}
