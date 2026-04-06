import { BookOpen, Briefcase, FileSearch, Mic, Building, HeartHandshake, Tent, ArrowRight } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "커리큘럼",
};

const timelineSteps = [
  { label: "전반기", period: "9~12월" },
  { label: "겨울캠프", period: "1~2월" },
  { label: "하반기", period: "3~6월" },
  { label: "수료식/입학식", period: "9월" },
];

const curriculumItems = [
  {
    title: "고전 읽기",
    icon: BookOpen,
    description: "HRA의 고전 읽기 과정은 국내외 대학에서 권장하는 고전 명작을 중심으로 진행됩니다. 참가자들은 책을 읽고 텍스트를 작성한 후, 발표와 토론을 통해 내용을 심층적으로 이해합니다. 이 과정을 통해 사고의 폭을 넓히고, 핵심을 정리하는 능력과 함께 글쓰기 및 발표 역량을 체계적으로 향상할 수 있습니다.",
  },
  {
    title: "경영서",
    icon: Briefcase,
    description: "경영서 학습은 기업과 조직, 시장의 구조를 이해하기 위한 과정입니다. 참가자들은 다양한 경영 관련 도서를 바탕으로 내용을 분석하고 토론하며, 실제 사례와 연결하여 이해를 높입니다. 이를 통해 실무적인 시각을 기르고, 사회 전반을 바라보는 통합적인 사고력을 갖출 수 있습니다.",
  },
  {
    title: "케이스스터디",
    icon: FileSearch,
    description: "케이스스터디는 실제 기업 및 사회의 사례를 기반으로 문제를 분석하고 해결 방안을 도출하는 교육 과정입니다. 참가자들은 팀 단위로 토론과 발표를 진행하며, 논리적으로 사고하고 자신의 의견을 설득력 있게 전달하는 능력을 기르게 됩니다. 이 과정을 통해 실무에 필요한 문제 해결 능력과 의사결정 역량을 강화할 수 있습니다.",
  },
  {
    title: "특강",
    icon: Mic,
    description: "HRA에서는 다양한 분야의 전문가를 초청하여 특강을 진행합니다. 스피치 훈련을 통해 표현력과 전달력을 향상하고, 영어 세션을 통해 글로벌 커뮤니케이션 역량을 기릅니다. 또한 취업 특강을 통해 진로 설정과 취업 준비에 필요한 실질적인 정보를 제공합니다. 이를 통해 참가자들은 자신의 역량을 보다 균형 있게 발전시킬 수 있습니다.",
  },
  {
    title: "하계 인턴",
    icon: Building,
    description: "하계 인턴 과정은 학습한 내용을 실제 현장에서 적용해 볼 수 있는 기회를 제공합니다. 참가자들은 기업 및 기관에서의 실무 경험을 통해 업무 환경을 이해하고, 자신의 역량을 점검할 수 있습니다. 이를 통해 이론과 실무를 연결하고, 진로 방향을 보다 구체적으로 설정할 수 있습니다.",
  },
  {
    title: "봉사활동",
    icon: HeartHandshake,
    description: "HRA는 일정 시간 이상의 봉사활동을 통해 사회적 책임과 공동체 의식을 함양하는 것을 중요하게 생각합니다. 참가자들은 다양한 봉사활동에 참여하며 타인과 사회에 대한 이해를 넓히고, 성숙한 시민으로서의 태도를 기르게 됩니다.",
  },
  {
    title: "겨울캠프",
    icon: Tent,
    description: "겨울캠프는 일정 기간 합숙하며 집중적으로 학습과 토론을 진행하는 프로그램입니다. 참가자들은 일상에서 벗어나 교육에 몰입하며, 사고력과 문제 해결 능력을 심화시킬 수 있습니다. 이 과정은 HRA 교육 과정 중 가장 집중도가 높은 프로그램으로, 참가자들의 성장에 중요한 역할을 합니다.",
  },
];

export default function CurriculumPage() {
  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] selection:bg-blue-100">
      <div className="mx-auto max-w-7xl px-6 sm:px-8 lg:px-12 py-24 sm:py-32">
        <section className="max-w-3xl mb-24 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-[#D9D9D9] text-sm font-medium text-[#666666] mb-8 shadow-[var(--shadow-soft)]">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            52주 교육 과정
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-bold tracking-tight text-[#1a1a1a] mb-8">
            커리큘럼
          </h1>
          <p className="text-lg sm:text-xl text-[#666666] leading-relaxed font-light">
            HRA의 52주 교육 프로그램은 단순한 지식 전달을 넘어, 참가자들이 스스로 사고하고 문제를 해결하며 성장할 수 있도록 설계된 몰입형 여정입니다.
          </p>
        </section>

        <section className="mb-32 relative">
          <div className="absolute top-0 left-6 sm:left-0 sm:top-1/2 sm:-translate-y-1/2 w-px h-full sm:w-full sm:h-px bg-[#D9D9D9] -z-10" />
          
          <div className="flex flex-col sm:flex-row justify-between gap-12 sm:gap-4 relative z-10 pl-16 sm:pl-0">
            {timelineSteps.map((step, index) => (
              <div key={step.label} className="flex flex-col sm:items-center relative group">
                 <div className="absolute -left-16 sm:left-auto sm:relative w-12 h-12 rounded-full bg-white border-2 border-[#D9D9D9] flex items-center justify-center mb-6 group-hover:border-blue-400 transition-colors duration-500 shadow-[var(--shadow-soft)]">
                   <span className="text-sm font-bold text-[#666666] group-hover:text-[#2563EB] transition-colors">
                    {index + 1}
                  </span>
                </div>
                
                {index < timelineSteps.length - 1 && (
                  <div className="hidden sm:block absolute top-6 left-[calc(50%+3rem)] w-[calc(100%-6rem)] h-px">
                     <ArrowRight className="absolute right-0 top-1/2 -translate-y-1/2 text-[#D9D9D9] w-4 h-4 -translate-x-full" />
                  </div>
                )}

                <div className="sm:text-center">
                   <h3 className="text-xl font-bold text-[#1a1a1a] mb-2">{step.label}</h3>
                   <p className="text-sm font-mono text-[#666666] bg-gray-50 px-3 py-1 rounded-full inline-block border border-[#D9D9D9]">
                    {step.period}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
          {curriculumItems.map((item, index) => (
            <div 
              key={item.title} 
              className="group relative flex flex-col p-8 sm:p-10 rounded-2xl bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] hover:bg-gray-50 hover:border-blue-400 transition-all duration-500 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-60 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="mb-8 p-4 rounded-2xl bg-gray-50 w-fit border border-[#D9D9D9] group-hover:scale-110 transition-transform duration-500">
                <item.icon className="w-8 h-8 text-blue-600" />
              </div>
              
              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-4 tracking-tight">
                {item.title}
              </h3>
              
              <p className="text-[#666666] leading-relaxed font-light mt-auto">
                {item.description}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
