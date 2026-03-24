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
import { Rocket, Users, BookOpen, ChevronRight } from "lucide-react";
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
        <div className="relative z-10 flex flex-col items-center max-w-5xl gap-8 animate-in fade-in zoom-in-95 duration-1000">
           <h2 className="text-sm font-medium tracking-widest text-cyan-400 uppercase">
             Human Renaissance Academy
           </h2>
           {/* 사이트 주제를 대표하는 큰 제목 */}
           <h1 className="text-5xl font-extrabold tracking-tight sm:text-7xl lg:text-8xl text-transparent bg-clip-text bg-gradient-to-br from-white via-gray-200 to-gray-500 pb-2 leading-tight">
             인간 르네상스<br />아카데미
           </h1>
           {/* 소개 텍스트 */}
           <p className="max-w-2xl text-lg sm:text-xl text-gray-400 font-light tracking-wide">
             당신의 가능성을 깨우는 곳. 최고의 인재들과 함께 한계를 넘어 성장하세요.
           </p>
           {/* 지원 버튼 */}
           <div className="mt-8 flex flex-col sm:flex-row gap-4">
            <Link href="/recruitment">
              <Button size="lg" className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold h-14 px-8 text-lg rounded-full transition-all hover:scale-105 shadow-[0_0_30px_-5px_rgba(6,182,212,0.4)]">
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

       {/* 핵심 가치 섹션: 도전, 성장, 경험 3가지 카드 */}
       <section className="relative z-10 px-4 py-32 bg-zinc-950/50 border-y border-white/5">
         <div className="max-w-7xl mx-auto">
           <div className="text-center mb-20">
             <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6">
               HRA 핵심 가치
             </h2>
             {/* 제목 아래 장식 라인 */}
             <div className="w-20 h-1 bg-cyan-500 mx-auto rounded-full" />
           </div>

           {/* 3개의 가치 카드 (도전/성장/경험) */}
           <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
            <div className="group relative p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-white/[0.07] transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                  <Rocket className="w-7 h-7 text-cyan-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">도전 (Challenge)</h3>
                <p className="text-gray-400 leading-relaxed">
                  "한계를 넘어서는 도전정신을 키웁니다"
                </p>
              </div>
            </div>

            <div className="group relative p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-blue-500/50 hover:bg-white/[0.07] transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                  <Users className="w-7 h-7 text-blue-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">성장 (Growth)</h3>
                <p className="text-gray-400 leading-relaxed">
                  "함께 배우고 함께 성장하는 커뮤니티"
                </p>
              </div>
            </div>

            <div className="group relative p-8 rounded-3xl bg-white/5 border border-white/10 hover:border-cyan-500/50 hover:bg-white/[0.07] transition-all duration-500">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-3xl" />
              <div className="relative z-10">
                <div className="w-14 h-14 rounded-2xl bg-cyan-500/20 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform duration-500">
                  <BookOpen className="w-7 h-7 text-cyan-400" />
                </div>
                <h3 className="text-2xl font-bold mb-4">경험 (Experience)</h3>
                <p className="text-gray-400 leading-relaxed">
                  "실전 프로젝트를 통한 진짜 배움"
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

       <section className="px-4 py-32">
         {/* 통계 섹션: 기수, 수료생, 코드라인, 열정 */}
         <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-12 divide-x divide-white/10">
          <div className="text-center px-4">
            <div className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">0</div>
            <div className="text-sm font-medium tracking-widest text-gray-400 uppercase">기수</div>
          </div>
          <div className="text-center px-4">
            <div className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">100+</div>
            <div className="text-sm font-medium tracking-widest text-gray-400 uppercase">수료생</div>
          </div>
          <div className="text-center px-4">
            <div className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">10K</div>
            <div className="text-sm font-medium tracking-widest text-gray-400 uppercase">코드 라인</div>
          </div>
          <div className="text-center px-4">
            <div className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-500 mb-2">∞</div>
            <div className="text-sm font-medium tracking-widest text-cyan-500 uppercase">열정</div>
          </div>
        </div>
      </section>

       <section className="relative px-4 py-40 overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-b from-transparent to-cyan-950/20" />
         {/* CTA(행동 유도) 섹션: 최종 지원 버튼 */}
         <div className="relative z-10 max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-6xl font-bold mb-8 tracking-tight">
            당신의 새로운 <span className="text-cyan-400">시작</span>
          </h2>
          <p className="text-xl text-gray-400 mb-12 font-light">
            최고의 동료들과 함께 압도적인 성장을 경험할 준비가 되셨나요?
          </p>
          <Link href="/recruitment">
            <Button size="lg" className="bg-white hover:bg-gray-100 text-black font-bold h-16 px-12 text-xl rounded-full transition-all hover:scale-105 shadow-xl shadow-cyan-500/20">
              HRA 지원하기
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}