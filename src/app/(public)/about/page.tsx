import { Award, BookOpen, Briefcase, Compass, Globe, Star } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "소개",
  description: "HRA(Human Renaissance Academy)의 비전, 목표, 그리고 인간 르네상스를 꿈꾸는 대학 연합 교육 프로그램을 소개합니다.",
};

// HRA 소개 페이지
// 프로젝트의 전체적인 비전과 핵심 가치를 소개합니다.
export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      {/* 1. 타이틀 섹션 */}
      <section className="mb-16">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#1a1a1a]">HRA 소개</h1>
        </div>
        <p className="text-[#666666] text-base md:text-lg max-w-2xl">
          정답보다 중요한 것, HRA는 본질을 묻는 법을 배웁니다.
        </p>
      </section>

      {/* 2. 소개 섹션 (2단 레이아웃) */}
      <section className="mb-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {/* 왼쪽: 이미지 영역 */}
          <div className="rounded-2xl aspect-[4/3] bg-gradient-to-br from-blue-100 to-blue-50 flex items-center justify-center border border-blue-100/50 shadow-inner">
            <span className="text-blue-600 font-medium text-lg">HRA 활동 사진</span>
          </div>
          {/* 오른쪽: 텍스트 설명 */}
          <div className="space-y-6">
            <p className="text-lg md:text-xl text-[#666666] leading-relaxed font-medium">
              HRA는 Human Renaissance Academy로, 단순한 지식 전달을 넘어, 청년들이 자기 삶의 주인이 되어 사회에 기여할 수 있도록 돕는 아카데미입니다.
            </p>
            <p className="text-[#666666] leading-relaxed">
              참가자들은 1년 동안 고전 읽기와 토의·토론, 케이스 스터디, 특강, 겨울 합숙을 거치며 배우고 성찰하고 실천하는 힘을 기릅니다.
            </p>
            <p className="text-[#666666] leading-relaxed">
              이를 통해 단기적으로는 사회가 요구하는 취업 역량을 갖추고, 장기적으로는 우리 사회의 발전을 이끄는 리더로 성장하는 것을 목표로 합니다.
            </p>
          </div>
        </div>
      </section>

      {/* 3. 주요 목적 및 비전 섹션 (순환 연결 다이어그램) */}
      <section className="mb-32">
        <div className="text-center mb-16 relative">
          <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-4">주요 목적 및 비전</h2>
          <div className="w-12 h-1 bg-[#2563EB] mx-auto rounded-full mb-4" />
          <p className="text-[#666666] text-lg">HRA가 나아가는 방향</p>
        </div>

        <div className="relative max-w-4xl mx-auto py-4">
          {/* 연결 선 (데스크탑) */}
          <div className="hidden md:block absolute top-1/2 left-0 w-full h-[1px] -translate-y-1/2 z-0">
            <svg
              className="w-full h-full absolute inset-0 overflow-visible"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="16.66%" y1="50%" x2="50%" y2="50%" stroke="#D9D9D9" strokeWidth="1" />
              <line x1="50%" y1="50%" x2="83.33%" y2="50%" stroke="#D9D9D9" strokeWidth="1" />
            </svg>
          </div>
          {/* 연결 선 (모바일) */}
          <div className="md:hidden absolute left-1/2 top-0 w-[1px] h-full -translate-x-1/2 z-0">
            <svg
              className="w-full h-full absolute inset-0 overflow-visible"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <line x1="50%" y1="16.66%" x2="50%" y2="50%" stroke="#D9D9D9" strokeWidth="1" />
              <line x1="50%" y1="50%" x2="50%" y2="83.33%" stroke="#D9D9D9" strokeWidth="1" />
            </svg>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-8 relative z-10">
            {/* 노드 1: 3C 인재 양성 */}
            <div className="flex flex-col items-center text-center group cursor-default">
              <div className="w-24 h-24 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center shadow-[var(--shadow-soft)] mb-6 transition-colors duration-300 group-hover:border-[#2563EB]">
                <Star className="w-10 h-10 text-[#2563EB]" />
              </div>
              <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">3C 인재 양성</h3>
              <p className="text-[#666666] text-sm leading-relaxed max-w-[200px]">업무능력과 성품, 사명감을 고루 갖춘 인재를 길러냅니다.</p>
            </div>
            
            {/* 노드 2: 비영리 기반 */}
            <div className="flex flex-col items-center text-center group cursor-default">
              <div className="w-24 h-24 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center shadow-[var(--shadow-soft)] mb-6 transition-colors duration-300 group-hover:border-[#2563EB]">
                <Globe className="w-10 h-10 text-[#2563EB]" />
              </div>
              <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">비영리 기반</h3>
              <p className="text-[#666666] text-sm leading-relaxed max-w-[200px]">수익이 아닌 청년의 성장을 중심에 두고 운영됩니다.</p>
            </div>
            
            {/* 노드 3: 교육 중점 */}
            <div className="flex flex-col items-center text-center group cursor-default">
              <div className="w-24 h-24 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center shadow-[var(--shadow-soft)] mb-6 transition-colors duration-300 group-hover:border-[#2563EB]">
                <BookOpen className="w-10 h-10 text-[#2563EB]" />
              </div>
              <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">사고력·표현력·실천력</h3>
              <p className="text-[#666666] text-sm leading-relaxed max-w-[200px]">발표와 토론을 바탕으로 한 학습자 주도형 교육을 지향합니다.</p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 핵심 가치 (3C) 섹션 */}
      <section className="mb-32">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] mb-4">핵심 가치</h2>
          <p className="text-[#666666] text-lg">HRA가 추구하는 3C 인재상</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Card 1 */}
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-400">
            <span className="absolute top-4 right-4 text-[180px] font-serif leading-none opacity-[0.06] select-none pointer-events-none text-blue-600">C</span>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full p-8 md:p-10 rounded-2xl">
              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-6">업무능력</h3>
              <p className="text-[#666666] leading-relaxed">
                단순히 지식을 많이 아는 것이 아니라, 배운 내용을 실제 문제 해결과 실행으로 연결할 수 있는 힘입니다. 스스로 생각하고 판단하며 끝까지 해내는 능력을 기릅니다.
              </p>
            </div>
          </div>

          {/* Card 2 */}
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-400">
            <span className="absolute bottom-4 left-4 text-[180px] font-serif leading-none opacity-[0.06] select-none pointer-events-none text-blue-600">C</span>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full p-8 md:p-10 rounded-2xl">
              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-6">성품</h3>
              <p className="text-[#666666] leading-relaxed">
                성품은 지식이나 성과만으로 드러나지 않습니다. HRA는 사람을 이해하는 마음, 함께 배우고 협력하는 자세, 그리고 바른 가치관 위에 서는 태도를 중요하게 여깁니다.
              </p>
            </div>
          </div>

          {/* Card 3 */}
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-blue-400">
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[180px] font-serif leading-none opacity-[0.06] select-none pointer-events-none text-blue-600">C</span>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full p-8 md:p-10 rounded-2xl">
              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-6">사명감</h3>
              <p className="text-[#666666] leading-relaxed">
                사명감은 맡은 일을 끝까지 해내는 책임감에서 시작해, 나아가 공동체와 사회를 향한 의식으로 확장됩니다. HRA는 배움을 삶 속에서 실천하는 사람을 길러 내고자 합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 5. 수업 운영 방식 섹션 */}
      <section className="mb-32">
        <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-8 text-center">수업 운영 방식</h2>
        <div className="max-w-4xl mx-auto rounded-2xl border border-[#D9D9D9] overflow-hidden shadow-[var(--shadow-soft)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-[#D9D9D9]">
                <th className="py-4 px-6 font-semibold text-[#1a1a1a] w-1/3 text-center sm:text-left">항목</th>
                <th className="py-4 px-6 font-semibold text-[#1a1a1a] text-center sm:text-left">내용</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9D9D9]">
              <tr className="bg-white hover:bg-gray-50/50 transition-colors">
                <td className="py-4 px-6 text-[#666666] font-medium text-center sm:text-left">교육 기간</td>
                <td className="py-4 px-6 text-[#1a1a1a]">52주 (매년 9월~다음 해 8월까지 교실수업 40주, 합숙 캠프 7박 8일 포함)</td>
              </tr>
              <tr className="bg-gray-50/30 hover:bg-gray-50/50 transition-colors">
                <td className="py-4 px-6 text-[#666666] font-medium text-center sm:text-left">교육 일시</td>
                <td className="py-4 px-6 text-[#1a1a1a]">매주 토요일 09:00~18:00</td>
              </tr>
              <tr className="bg-white hover:bg-gray-50/50 transition-colors">
                <td className="py-4 px-6 text-[#666666] font-medium text-center sm:text-left">교육 장소</td>
                <td className="py-4 px-6 text-[#1a1a1a]">제주대학교</td>
              </tr>
              <tr className="bg-gray-50/30 hover:bg-gray-50/50 transition-colors">
                <td className="py-4 px-6 text-[#666666] font-medium text-center sm:text-left">수업료</td>
                <td className="py-4 px-6 text-[#2563EB] font-bold">무료</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. 수료 후 혜택 섹션 */}
      <section>
        <h2 className="text-2xl md:text-3xl font-bold text-[#1a1a1a] mb-8 text-center">수료 후 혜택</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Benefit 1 */}
          <div className="group border border-[#D9D9D9] border-t-4 border-t-transparent hover:border-t-[#2563EB] bg-white rounded-2xl p-8 shadow-[var(--shadow-soft)] hover:shadow-lg transition-all duration-300 hover:scale-[1.02] flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6">
              <Award className="w-8 h-8 text-[#2563EB]" />
            </div>
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">수료증 및 추천서 수여</h3>
            <p className="text-[#666666] text-sm leading-relaxed">과정 수료 후 공식 수료증과 추천서를 발급받으실 수 있습니다.</p>
          </div>
          
          {/* Benefit 2 */}
          <div className="group border border-[#D9D9D9] border-t-4 border-t-transparent hover:border-t-[#2563EB] bg-white rounded-2xl p-8 shadow-[var(--shadow-soft)] hover:shadow-lg transition-all duration-300 hover:scale-[1.02] flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6">
              <Compass className="w-8 h-8 text-[#2563EB]" />
            </div>
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">진로 지도</h3>
            <p className="text-[#666666] text-sm leading-relaxed">전문 멘토진이 1:1 진로 상담을 통해 여러분의 미래를 함께 설계합니다.</p>
          </div>

          {/* Benefit 3 */}
          <div className="group border border-[#D9D9D9] border-t-4 border-t-transparent hover:border-t-[#2563EB] bg-white rounded-2xl p-8 shadow-[var(--shadow-soft)] hover:shadow-lg transition-all duration-300 hover:scale-[1.02] flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-6">
              <Briefcase className="w-8 h-8 text-[#2563EB]" />
            </div>
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-3">취업 알선</h3>
            <p className="text-[#666666] text-sm leading-relaxed">HRA 네트워크를 통한 기업 연결 및 취업 기회를 제공합니다.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
