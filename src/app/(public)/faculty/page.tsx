import { Metadata } from "next";
import { User } from "lucide-react";

export const metadata: Metadata = {
  title: "교수진 소개",
  description: "HRA의 교육을 이끄는 교수진을 소개합니다.",
};

const facultyMembers = [
  {
    id: 1,
    name: "김철수",
    title: "주임교수",
    department: "경영학",
    description: "전략적 의사결정과 기업가 정신을 연구하며, 실전 비즈니스 케이스를 중심으로 강의합니다.",
  },
  {
    id: 2,
    name: "이영희",
    title: "초빙교수",
    department: "인문/철학",
    description: "고전 철학에서 현대적 리더십의 지혜를 발굴하여 차세대 리더들에게 전달합니다.",
  },
  {
    id: 3,
    name: "박민준",
    title: "겸임교수",
    department: "커뮤니케이션",
    description: "조직 내 소통과 설득의 기술을 다루며, 효과적인 프레젠테이션 방법을 지도합니다.",
  },
  {
    id: 4,
    name: "최지윤",
    title: "객원교수",
    department: "기술경영",
    description: "디지털 전환과 IT 트렌드가 산업 전반에 미치는 영향을 분석하고 혁신 전략을 모색합니다.",
  },
  {
    id: 5,
    name: "정진우",
    title: "연구교수",
    department: "행동경제학",
    description: "인간의 비합리적 선택을 분석하여 더 나은 의사결정 환경을 설계하는 방법을 연구합니다.",
  },
  {
    id: 6,
    name: "강서연",
    title: "전임교수",
    department: "조직행동론",
    description: "조직 내 갈등 관리와 팀워크 향상을 위한 심리학적 접근 방식을 연구하고 교육합니다.",
  }
];

/**
 * HRA 교수진 소개 페이지
 * @description 교육 과정을 이끄는 교수진 목록을 보여주는 페이지입니다.
 */
export default function FacultyPage() {
  return (
    <main className="min-h-screen py-24 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-16 space-y-4">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-white">
            교수진 소개
          </h1>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto">
            HRA의 교육을 이끄는 교수진을 소개합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
          {facultyMembers.map((faculty) => (
            <div
              key={faculty.id}
              className="group relative flex flex-col items-center text-center rounded-2xl p-8 bg-white/5 border border-white/10 transition-all duration-300 hover:bg-white/10 hover:border-white/20 hover:shadow-[0_0_30px_rgba(255,255,255,0.05)]"
            >
              <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-6 group-hover:scale-105 transition-transform duration-300 group-hover:bg-white/10">
                <User className="w-10 h-10 text-white/40 group-hover:text-white/70 transition-colors duration-300" />
              </div>

              <h3 className="text-xl font-bold text-white mb-2">{faculty.name}</h3>
              
              <div className="flex items-center justify-center gap-2 mb-4 text-sm font-medium">
                <span className="text-white/80">{faculty.title}</span>
                <span className="w-1 h-1 rounded-full bg-white/30"></span>
                <span className="text-white/60">{faculty.department}</span>
              </div>
              
              <p className="text-white/50 text-sm leading-relaxed">
                {faculty.description}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-16 text-center">
          <p className="text-sm text-white/40">
            ※ 위즈덤시티 운영진/임원 포함 여부는 추가 검토 중입니다.
          </p>
        </div>
      </div>
    </main>
  );
}
