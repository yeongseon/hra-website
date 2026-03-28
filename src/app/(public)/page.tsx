/**
 * 홈 페이지 (src/app/(public)/page.tsx)
 * 
 * 이 파일은 HRA 웹사이트의 첫 페이지를 보여줍니다.
 * - HRA 소개 및 미션 전달
 * - 핵심 가치 3가지 (도전, 성장, 경험) 표시
 * - 통계 정보 (기수, 수료생, 열정)
 * - 지원하기 버튼으로 사용자 유도
 */

import Link from "next/link";
import { Lightbulb, Heart, Target, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-[#0A0A0A] text-white selection:bg-cyan-500/30">
      {/* 히어로 섹션: 제목과 대표 배너 */}
       <section className="relative flex flex-col items-center justify-center min-h-screen px-4 overflow-hidden text-center">
        {/* 배경 그래디언트 효과 */}
        <div className="absolute inset-0 z-0 flex items-center justify-center pointer-events-none opacity-20">
           <div className="absolute w-[80vw] h-[80vw] max-w-3xl max-h-[800px] rounded-full bg-cyan-600/30 blur-[120px] mix-blend-screen" />
           <div className="absolute w-[60vw] h-[60vw] max-w-2xl max-h-[600px] rounded-full bg-blue-600/20 blur-[100px] mix-blend-screen translate-x-1/4 translate-y-1/4" />
         </div>

        {/* 메인 제목과 설명 텍스트 */}
        <div className="relative z-10 flex flex-col items-center max-w-5xl gap-6 sm:gap-8 animate-in fade-in zoom-in-95 duration-1000">
           <h2 className="text-xs sm:text-sm font-medium tracking-widest text-cyan-400 uppercase">
             Human Renaissance Academy
           </h2>
           {/* 사이트 주제를 대표하는 큰 제목 — 모바일에서 적절한 크기로 시작 */}
           <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl md:text-7xl lg:text-8xl text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-500 pb-2 leading-tight">
             배우고,<br />토론하고,<br />실행하라
           </h1>
           {/* 소개 텍스트 */}
           <p className="max-w-2xl text-base sm:text-lg md:text-xl text-gray-400 font-light tracking-wide px-2 leading-relaxed">
             Human Renaissance Academy(HRA)는 고전 읽기와 토의·토론, 케이스 스터디를 바탕으로 배우고 토론하고 실행하는 과정을 통해, 청년들이 더 넓게 생각하고 더 깊이 성찰하며 공동체를 이끌어갈 힘을 기르도록 돕는 아카데미입니다.
           </p>
           {/* 지원 버튼 — 모바일에서 적절한 크기 */}
           <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-4">
            <Link href="/recruitment">
              <Button size="lg" className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold h-12 px-6 text-base sm:h-14 sm:px-8 sm:text-lg rounded-full transition-all hover:scale-105 shadow-[0_0_30px_-5px_rgba(6,182,212,0.4)]">
                지원하기
                <ChevronRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="absolute bottom-12 left-1/2 -translate-x-1/2 animate-bounce opacity-50">
          {/* 아래로 스크롤하라는 표시 (애니메이션 화살표) */}
          <div className="w-1 h-12 rounded-full bg-gradient-to-b from-cyan-400 to-transparent" />
         </div>
       </section>

       {/* 핵심 가치 섹션: 3C (Competence, Character, Commitment) */}
       <section className="relative z-10 px-4 py-16 sm:py-24 md:py-32 bg-zinc-950/50 border-y border-white/5">
         <div className="max-w-7xl mx-auto">
           <div className="text-center mb-12 sm:mb-20">
             <h2 className="text-2xl sm:text-3xl md:text-5xl font-bold tracking-tight mb-6">
               HRA 핵심 가치
             </h2>
             {/* 제목 아래 장식 라인 */}
             <div className="w-20 h-1 bg-cyan-500 mx-auto rounded-full" />
           </div>

           {/* 3개의 가치 카드 (3C) */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 lg:gap-12">
            <div className="group relative p-6 sm:p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-white/[0.07] transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-6 sm:mb-8 group-hover:scale-110 transition-transform duration-500">
                  <Lightbulb className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-2">Competence</h3>
                <h4 className="text-lg font-medium text-cyan-300 mb-4">업무능력</h4>
                <p className="text-gray-400 leading-relaxed">
                  배움을 실천으로 이어가는 힘
                </p>
              </div>
            </div>

            <div className="group relative p-6 sm:p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-blue-500/50 hover:bg-white/[0.07] transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6 sm:mb-8 group-hover:scale-110 transition-transform duration-500">
                  <Heart className="w-6 h-6 sm:w-7 sm:h-7 text-blue-400" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-2">Character</h3>
                <h4 className="text-lg font-medium text-blue-300 mb-4">성품</h4>
                <p className="text-gray-400 leading-relaxed">
                  생각의 깊이와 마음의 넓이를 기르는 자세
                </p>
              </div>
            </div>

            <div className="group relative p-6 sm:p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-white/[0.07] transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
              <div className="relative z-10">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-6 sm:mb-8 group-hover:scale-110 transition-transform duration-500">
                  <Target className="w-6 h-6 sm:w-7 sm:h-7 text-cyan-400" />
                </div>
                <h3 className="text-xl sm:text-2xl font-bold mb-2">Commitment</h3>
                <h4 className="text-lg font-medium text-cyan-300 mb-4">사명감</h4>
                <p className="text-gray-400 leading-relaxed">
                  나를 넘어 사회를 향하는 마음
                </p>
              </div>
            </div>
          </div>
         </div>
       </section>

       <section className="px-4 py-16 sm:py-24 md:py-32">
         {/* 통계 섹션: 운영 연도, 수료생, 고전 권수, 취업률 */}
         <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8 md:gap-12">
          <div className="text-center px-2 sm:px-4">
            <div className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">19</div>
            <div className="text-xs sm:text-sm font-medium tracking-widest text-gray-400 uppercase">운영 연도</div>
          </div>
          <div className="text-center px-2 sm:px-4">
            <div className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">399</div>
            <div className="text-xs sm:text-sm font-medium tracking-widest text-gray-400 uppercase">수료생</div>
          </div>
          <div className="text-center px-2 sm:px-4">
            <div className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">50+</div>
            <div className="text-xs sm:text-sm font-medium tracking-widest text-gray-400 uppercase">고전 권수</div>
          </div>
          <div className="text-center px-2 sm:px-4">
            <div className="text-3xl sm:text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">95%</div>
            <div className="text-xs sm:text-sm font-medium tracking-widest text-cyan-500 uppercase">취업률</div>
          </div>
        </div>
      </section>

       <section className="relative px-4 py-20 sm:py-32 md:py-40 overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-b from-transparent to-cyan-950/20" />
         {/* CTA(행동 유도) 섹션 */}
         <div className="relative z-10 max-w-4xl mx-auto text-center px-2">
          <h2 className="text-2xl sm:text-4xl md:text-6xl font-bold mb-6 sm:mb-8 tracking-tight">
            당신의 새로운 <span className="text-cyan-400">시작</span>
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-8 sm:mb-12 font-light">
            최고의 동료들과 함께 압도적인 성장을 경험할 준비가 되셨나요?
          </p>
          <Link href="/recruitment">
            <Button size="lg" className="bg-white hover:bg-gray-100 text-black font-bold h-12 px-8 text-base sm:h-14 sm:px-10 sm:text-lg md:h-16 md:px-12 md:text-xl rounded-full transition-all hover:scale-105 shadow-xl shadow-cyan-500/20">
              지원하기
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}