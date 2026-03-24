/**
 * 소개 페이지 (src/app/(public)/about/page.tsx)
 * 
 * HRA(Human Renaissance Academy)의 기본 정보를 보여주는 페이지입니다.
 * - HRA 미션 및 설명
 * - 핵심 가치 4가지 (인문학, 기술, 공동체, 실천)
 * - 연혁 (설립, 1기, 2기)
 */

import { BookOpen, Cpu, Users, Wrench } from "lucide-react";
import type { Metadata } from "next";

/**
 * SEO 최적화: 이 페이지가 검색엔진에 어떻게 표시될지 설정
 * 페이지 제목은 "소개"로 표시됨
 */
export const metadata: Metadata = {
  title: "소개",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-6">
      {/* 소개 페이지 메인 제목과 설명 */}
      <section className="py-20 md:py-32">
         <h1 className="text-4xl font-bold tracking-tight md:text-6xl text-white">
            HRA 소개
          </h1>
          {/* 프로그램 한 줄 설명 */}
          <p className="mt-6 text-xl text-gray-400 max-w-3xl leading-relaxed">
            HRA는 인문학과 기술의 융합을 탐구하며, 인간 르네상스를 지향하는 대학생 교육 프로그램입니다.
          </p>
       </section>

       {/* 핵심 가치 섹션: 4개 항목 (인문학, 기술, 공동체, 실천) */}
       <section className="py-16 border-t border-white/10">
          <h2 className="text-2xl font-semibold mb-12">핵심 가치</h2>
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <BookOpen className="w-8 h-8 mb-4 text-gray-300" />
             <h3 className="text-xl font-medium mb-2">
               인문학
             </h3>
             <p className="text-gray-400 leading-relaxed">
               인간의 본성, 역사, 철학에 대한 깊은 이해를 추구합니다.
             </p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <Cpu className="w-8 h-8 mb-4 text-gray-300" />
             <h3 className="text-xl font-medium mb-2">
               기술
             </h3>
             <p className="text-gray-400 leading-relaxed">
               디지털 세계를 만들고 변화시키는 실용적 기술을 익힙니다.
             </p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <Users className="w-8 h-8 mb-4 text-gray-300" />
             <h3 className="text-xl font-medium mb-2">
               공동체
             </h3>
             <p className="text-gray-400 leading-relaxed">
               협업과 공동의 목표를 통해 함께 성장합니다.
             </p>
          </div>
          <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
            <Wrench className="w-8 h-8 mb-4 text-gray-300" />
             <h3 className="text-xl font-medium mb-2">
               실천
             </h3>
             <p className="text-gray-400 leading-relaxed">
               아이디어를 현실 세계의 변화로 만들어갑니다.
             </p>
          </div>
        </div>
      </section>

       <section className="py-16 border-t border-white/10">
          <h2 className="text-2xl font-semibold mb-12">연혁</h2>
         {/* 타임라인: 2023 설립 → 2024 1기 → 2025 2기 */}
         <div className="space-y-8 pl-4 border-l-2 border-white/10">
          <div className="relative">
            <div className="absolute w-3 h-3 bg-white rounded-full -left-[23px] top-1.5" />
            <div className="text-gray-400 mb-1">2023</div>
             <h3 className="text-xl font-medium text-white">
               설립
             </h3>
             <p className="text-gray-400 mt-2">
               인간 르네상스 아카데미의 시작
             </p>
          </div>
          <div className="relative">
            <div className="absolute w-3 h-3 bg-white/50 rounded-full -left-[23px] top-1.5" />
            <div className="text-gray-400 mb-1">2024</div>
             <h3 className="text-xl font-medium text-white">
               1기
             </h3>
             <p className="text-gray-400 mt-2">
               다양한 분야의 교차점을 탐구한 첫 번째 기수
             </p>
          </div>
          <div className="relative">
            <div className="absolute w-3 h-3 bg-white/20 rounded-full -left-[23px] top-1.5" />
            <div className="text-gray-400 mb-1">2025</div>
             <h3 className="text-xl font-medium text-white">
               2기
             </h3>
             <p className="text-gray-400 mt-2">
               커뮤니티 확장과 커리큘럼 심화
             </p>
          </div>
        </div>
      </section>
    </div>
  );
}
