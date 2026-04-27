import type { Metadata } from "next";
import { BenefitsSection } from "./_components/benefits-section";

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
            <p className="text-lg md:text-xl text-[#666666] leading-relaxed font-medium whitespace-pre-line">
              {`사회에 나가기 전, 무엇이 필요할까요?

              HRA는 고전 읽기, 토론, 케이스 스터디, 겨울 합숙을
              통해 생각하고 성찰하고 실천하는 힘을 기릅니다.

              1년의 과정이 끝날 때,
              취업할 준비가 된 사람이 아니라
              스스로 삶을 이끄는 사람이 됩니다.`}
            </p>
          </div>
        </div>
      </section>

      {/* 3. 주요 목적 및 비전 섹션 */}
      <section className="mb-32">
        <div className="text-center mb-12">
          <p className="text-[#999999] tracking-[0.15em] text-sm font-semibold uppercase mb-4">PURPOSE & VISION</p>
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] mb-6">주요 목적 및 비전</h2>
          <div className="w-12 h-1 bg-[#2563EB] mx-auto rounded-full mb-8" />
          <p className="text-[#666666] text-lg leading-relaxed max-w-2xl mx-auto">
            HRA는 단순한 지식 전달을 넘어, 업무능력과 성품, 사명감을 고루 갖춘 3C 인재를 양성합니다.<br />
            비영리 기반으로 수익이 아닌 청년의 성장을 중심에 두며, 사고력과 표현력, 실천력을 기르는 학습자 주도형 교육을 지향합니다.
          </p>
        </div>

        <div className="max-w-4xl mx-auto bg-[#f9fafb] rounded-2xl p-8 md:p-12 relative">
          <div className="flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 relative">
            {/* Connecting Line (Desktop) */}
            <div className="hidden md:block absolute top-12 left-1/2 -translate-x-1/2 w-48 h-[1px] bg-[#D9D9D9]" />
            {/* Connecting Line (Mobile) */}
            <div className="md:hidden absolute left-1/2 top-12 -translate-x-1/2 w-[1px] h-32 bg-[#D9D9D9]" />

            {/* Left Circle: 목적 */}
            <div className="relative flex flex-col items-center text-center z-10 w-full max-w-[280px]">
              <div className="w-24 h-24 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center shadow-[var(--shadow-soft)] mb-6">
                <span className="text-xl font-bold text-[#1a1a1a]">목적</span>
              </div>
              <p className="text-[#666666] leading-relaxed">
                업무능력과 성품, 사명감을 고루 갖춘<br />
                인재를 길러냅니다.
              </p>
            </div>

            {/* Right Circle: 비전 */}
            <div className="relative flex flex-col items-center text-center z-10 w-full max-w-[280px]">
              <div className="w-24 h-24 rounded-full bg-white border border-[#D9D9D9] flex items-center justify-center shadow-[var(--shadow-soft)] mb-6">
                <span className="text-xl font-bold text-[#1a1a1a]">비전</span>
              </div>
              <p className="text-[#666666] leading-relaxed">
                청년의 성장을 중심에 둔 비영리 운영과<br />
                학습자 주도형 교육을 지향합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 4. 핵심 가치 (3C) 섹션 */}
      <section className="mb-32">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a1a]">핵심가치: 3C 인재상</h2>
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
        <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] mb-8 text-center">수업 운영 방식</h2>
        <div className="max-w-4xl mx-auto">
          <table className="w-full border-collapse">
            <tbody className="divide-y divide-[#D9D9D9] border-t border-[#D9D9D9]">
              <tr className="bg-white transition-colors">
                <td className="py-6 px-4 md:px-6 text-[#666666] font-medium text-left w-1/3">교육 기간</td>
                <td className="py-6 px-4 md:px-6 text-[#1a1a1a] text-right">52주 (매년 9월~다음 해 8월까지 교실수업 40주, 합숙 캠프 7박 8일 포함)</td>
              </tr>
              <tr className="bg-white transition-colors">
                <td className="py-6 px-4 md:px-6 text-[#666666] font-medium text-left">교육 일시</td>
                <td className="py-6 px-4 md:px-6 text-[#1a1a1a] text-right">매주 토요일 09:00~18:00</td>
              </tr>
              <tr className="bg-white transition-colors">
                <td className="py-6 px-4 md:px-6 text-[#666666] font-medium text-left">교육 장소</td>
                <td className="py-6 px-4 md:px-6 text-[#1a1a1a] text-right">제주대학교</td>
              </tr>
              <tr className="bg-white transition-colors">
                <td className="py-6 px-4 md:px-6 text-[#666666] font-medium text-left">수업료</td>
                <td className="py-6 px-4 md:px-6 text-[#2563EB] font-bold text-right">무료</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {/* 6. 수료 후 혜택 섹션 */}
      <section>
        <h2 className="text-3xl md:text-4xl font-bold text-[#1a1a1a] mb-8 text-center">수료 후 혜택</h2>
        <BenefitsSection />
      </section>
    </div>
  );
}
