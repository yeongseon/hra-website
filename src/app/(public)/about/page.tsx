import { BookOpen, Lightbulb, Users, Target, Award, Briefcase, Compass } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "소개",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-24">
      <section className="py-20 md:py-32 text-center">
        <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-white mb-6">
          정답보다 중요한 것, <br className="md:hidden" />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-400">HRA는 본질을 묻는 법을 배웁니다</span>
        </h1>
      </section>

      <section className="mb-24 relative">
        <div className="absolute inset-0 bg-blue-500/5 blur-3xl rounded-full" />
        <div className="relative bg-white/5 border border-white/10 p-8 md:p-12 rounded-3xl backdrop-blur-sm">
          <p className="text-lg md:text-xl text-gray-300 leading-relaxed md:leading-loose text-center max-w-4xl mx-auto font-medium">
            HRA는 Human Renaissance Academy로, 단순한 지식 전달을 넘어, 청년들이 자기 삶의 주인이 되어 사회에 기여할 수 있도록 돕는 아카데미입니다. 참가자들은 1년 동안 고전 읽기와 토의·토론, 케이스 스터디, 특강, 겨울 합숙을 거치며 배우고 성찰하고 실천하는 힘을 기릅니다. 이를 통해 단기적으로는 사회가 요구하는 취업 역량을 갖추고, 장기적으로는 우리 사회의 발전을 이끄는 리더로 성장하는 것을 목표로 합니다.
          </p>
        </div>
      </section>

      <section className="mb-24">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-10 text-center">주요 목적 및 비전</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              id: "vision-1",
              icon: Target,
              text: "본 교육과정의 주요 목적은 업무능력과 성품, 사명감을 고루 갖춘 3C 인재를 양성하는 데 있습니다."
            },
            {
              id: "vision-2",
              icon: Users,
              text: "비영리(NPO) 기반으로 운영되어 수익이 아닌 청년의 성장을 중심에 두고 발표와 토론을 바탕으로 한 학습자 주도형 교육을 지향합니다."
            },
            {
              id: "vision-3",
              icon: BookOpen,
              text: "또한 고전 읽기, 에세이 작성, 케이스 스터디, 스피치 훈련 등을 통해 사고력과 표현력, 실천 역량을 기르는 데 중점을 둡니다."
            }
          ].map((item, i) => (
            <div key={item.id} className="bg-white/[0.03] border border-white/10 p-8 rounded-2xl hover:bg-white/[0.05] transition-colors">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mb-6">
                <item.icon className="w-6 h-6 text-blue-400" />
              </div>
              <div className="flex gap-4">
                <span className="text-4xl font-black text-white/10 select-none">0{i + 1}</span>
                <p className="text-gray-300 leading-relaxed pt-2">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-32">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">핵심 가치</h2>
          <p className="text-gray-400 text-lg">HRA가 추구하는 3C 인재상</p>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="group relative bg-gradient-to-b from-slate-800/80 to-slate-900/80 p-1 rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full bg-slate-950 p-8 md:p-10 rounded-[22px] border border-white/5">
              <div className="text-blue-400 font-mono text-sm tracking-widest uppercase mb-2">Competence</div>
              <h3 className="text-2xl font-bold text-white mb-6">업무능력</h3>
              <p className="text-gray-400 leading-relaxed">
                단순히 지식을 많이 아는 것이 아니라, 배운 내용을 실제 문제 해결과 실행으로 연결할 수 있는 힘입니다. 스스로 생각하고 판단하며 끝까지 해내는 능력을 기릅니다.
              </p>
            </div>
          </div>

          <div className="group relative bg-gradient-to-b from-slate-800/80 to-slate-900/80 p-1 rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full bg-slate-950 p-8 md:p-10 rounded-[22px] border border-white/5">
              <div className="text-indigo-400 font-mono text-sm tracking-widest uppercase mb-2">Character</div>
              <h3 className="text-2xl font-bold text-white mb-6">성품</h3>
              <p className="text-gray-400 leading-relaxed">
                성품은 지식이나 성과만으로 드러나지 않습니다. HRA는 사람을 이해하는 마음, 함께 배우고 협력하는 자세, 그리고 바른 가치관 위에 서는 태도를 중요하게 여깁니다.
              </p>
            </div>
          </div>

          <div className="group relative bg-gradient-to-b from-slate-800/80 to-slate-900/80 p-1 rounded-3xl overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative h-full bg-slate-950 p-8 md:p-10 rounded-[22px] border border-white/5">
              <div className="text-purple-400 font-mono text-sm tracking-widest uppercase mb-2">Commitment</div>
              <h3 className="text-2xl font-bold text-white mb-6">사명감</h3>
              <p className="text-gray-400 leading-relaxed">
                사명감은 맡은 일을 끝까지 해내는 책임감에서 시작해, 나아가 공동체와 사회를 향한 의식으로 확장됩니다. HRA는 배움을 삶 속에서 실천하는 사람을 길러 내고자 합니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-24">
        <h2 className="text-2xl md:text-3xl font-bold text-white mb-10 text-center">교육 효과</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-6">
          {[
            { id: "effect-1", icon: Compass, text: "글로벌 마인드를 가진 창조적 인재 육성" },
            { id: "effect-2", icon: Users, text: "성품(Character), 업무능력(Competence), 사명감(Commitment)을 갖춘 청년 배출" },
            { id: "effect-3", icon: Lightbulb, text: "인문학적 소양을 통한 생성형 AI 활용 능력 향상" },
            { id: "effect-4", icon: Briefcase, text: "기업 2~3년 차 정도의 실무 역량 강화" }
          ].map((item) => (
            <div key={item.id} className="flex items-center gap-5 p-6 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-colors">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                <item.icon className="w-5 h-5 text-gray-300" />
              </div>
              <p className="text-gray-300 font-medium">{item.text}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-8">
        <section>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">수업 운영 방식</h2>
          <div className="space-y-4">
            <div className="flex justify-between items-center py-5 border-b border-white/10">
              <span className="text-gray-400 font-medium">교육 기간</span>
              <span className="text-white text-right max-w-[60%]">52주 (매년 9월~다음 해 8월까지 교실수업 40주, 합숙 캠프 7박 8일 포함)</span>
            </div>
            <div className="flex justify-between items-center py-5 border-b border-white/10">
              <span className="text-gray-400 font-medium">교육 일시</span>
              <span className="text-white text-right">매주 토요일 09:00~18:00</span>
            </div>
            <div className="flex justify-between items-center py-5 border-b border-white/10">
              <span className="text-gray-400 font-medium">교육 장소</span>
              <span className="text-white text-right">제주대학교</span>
            </div>
            <div className="flex justify-between items-center py-5 border-b border-white/10">
              <span className="text-gray-400 font-medium">수업료</span>
              <span className="text-blue-400 font-bold text-right">무료</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-8">수료 후 혜택</h2>
          <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-500/20 rounded-3xl p-8 sm:p-10 h-[calc(100%-4rem)] flex flex-col justify-center gap-8">
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Award className="w-6 h-6 text-blue-400" />
              </div>
              <div className="text-xl text-white font-medium">수료증 및 추천서 수여</div>
            </div>
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                <Compass className="w-6 h-6 text-indigo-400" />
              </div>
              <div className="text-xl text-white font-medium">진로 지도</div>
            </div>
            <div className="flex items-center gap-5">
              <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <Briefcase className="w-6 h-6 text-purple-400" />
              </div>
              <div className="text-xl text-white font-medium">취업 알선</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
