import { Book, Code, Terminal, MessageSquare } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "커리큘럼",
};

export default function CurriculumPage() {
  return (
    <div className="mx-auto max-w-7xl px-6">
      <section className="py-20 md:py-32">
        <h1 className="text-4xl font-bold tracking-tight md:text-6xl text-white">
          커리큘럼
        </h1>
        <p className="mt-6 text-xl text-gray-400 max-w-3xl leading-relaxed">
          인문학적 탐구와 기술적 실행의 간극을 연결하는 2학기 집중 커리큘럼입니다.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 pb-32">
        <section>
          <div className="mb-8 inline-block rounded-full bg-white/10 px-4 py-1.5">
            <h2 className="text-sm font-medium tracking-wide">
              봄학기
            </h2>
          </div>
          <div className="space-y-6">
            <div className="group rounded-2xl bg-white/5 border border-white/10 p-8 transition-colors hover:bg-white/10 hover:border-white/20">
              <Book className="w-8 h-8 mb-6 text-gray-300" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-medium text-white">인문학 세미나</h3>
                <span className="text-sm text-gray-400 font-mono bg-black/50 px-3 py-1 rounded-full">
                  주 1회, 2시간
                </span>
              </div>
              <p className="text-gray-400 font-medium mb-3">인문학 세미나</p>
              <p className="text-gray-500 leading-relaxed">
                인간의 가치와 사회 구조를 이해하기 위한 기초 텍스트와 철학적 프레임워크를 탐구합니다.
              </p>
            </div>
            
            <div className="group rounded-2xl bg-white/5 border border-white/10 p-8 transition-colors hover:bg-white/10 hover:border-white/20">
              <MessageSquare className="w-8 h-8 mb-6 text-gray-300" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-medium text-white">독서 토론</h3>
                <span className="text-sm text-gray-400 font-mono bg-black/50 px-3 py-1 rounded-full">
                  주 1회, 2시간
                </span>
              </div>
              <p className="text-gray-400 font-medium mb-3">독서 토론</p>
              <p className="text-gray-500 leading-relaxed">
                역사, 윤리, 기술이 사회에 미치는 영향에 대한 비판적 분석과 토론을 진행합니다.
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-8 inline-block rounded-full bg-white/10 px-4 py-1.5">
            <h2 className="text-sm font-medium tracking-wide">
              가을학기
            </h2>
          </div>
          <div className="space-y-6">
            <div className="group rounded-2xl bg-white/5 border border-white/10 p-8 transition-colors hover:bg-white/10 hover:border-white/20">
              <Code className="w-8 h-8 mb-6 text-gray-300" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-medium text-white">기술 워크숍</h3>
                <span className="text-sm text-gray-400 font-mono bg-black/50 px-3 py-1 rounded-full">
                  주 1회, 2시간
                </span>
              </div>
              <p className="text-gray-400 font-medium mb-3">기술 워크숍</p>
              <p className="text-gray-500 leading-relaxed">
                현대 웹 개발, 알고리즘, 소프트웨어 엔지니어링 원칙을 다루는 실습 세션입니다.
              </p>
            </div>

            <div className="group rounded-2xl bg-white/5 border border-white/10 p-8 transition-colors hover:bg-white/10 hover:border-white/20">
              <Terminal className="w-8 h-8 mb-6 text-gray-300" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-medium text-white">프로젝트 실습</h3>
                <span className="text-sm text-gray-400 font-mono bg-black/50 px-3 py-1 rounded-full">
                  주 1회, 2시간
                </span>
              </div>
              <p className="text-gray-400 font-medium mb-3">프로젝트 실습</p>
              <p className="text-gray-500 leading-relaxed">
                팀 협업을 통해 실제 문제를 해결하는 솔루션을 구축합니다.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
