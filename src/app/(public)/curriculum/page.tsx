"use client";

import { useState } from "react";
import { BookOpen, Briefcase, FileSearch, Mic, Building, HeartHandshake, Tent } from "lucide-react";

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

const journeyPhases = [
  {
    id: "first",
    title: "전반기",
    months: "9월 - 12월",
    desc: "고전 읽기·토론, 케이스 스터디, 경영서 리뷰 시작. 매주 토요일 09:00–18:00 진행.",
  },
  {
    id: "winter",
    title: "겨울캠프",
    months: "1월 - 2월",
    desc: "7박 8일 합숙 집중 훈련. 강도 높은 토론·특강·팀 프로젝트로 사고력 극대화.",
  },
  {
    id: "second",
    title: "하반기",
    months: "3월 - 6월",
    desc: "전반기 역량 심화. 하계 인턴·봉사활동·실전 케이스 스터디 병행.",
  },
  {
    id: "graduation",
    title: "수료식",
    months: "7월 - 8월",
    desc: "52주 과정 마무리. 수료증·추천서 수여 및 차기 기수 입학식 동시 개최.",
  }
];

export default function CurriculumPage() {
  const [activePhase, setActivePhase] = useState(journeyPhases[0].id);

  const activePhaseData = journeyPhases.find(p => p.id === activePhase);

  return (
    <div className="min-h-screen bg-white text-[#1a1a1a] selection:bg-blue-100">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
        <section className="mb-12 sm:mb-20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-8 bg-[#2563EB] rounded-full" />
            <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
              커리큘럼
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-[#666666] md:text-base">
            HRA의 52주 교육 프로그램은 단순한 지식 전달을 넘어, 참가자들이 스스로 사고하고 문제를 해결하며 성장할 수 있도록 설계된 몰입형 여정입니다.
          </p>
        </section>

        {/* 52주 여정 타임라인 섹션 (개선됨) */}
        <section className="mb-24 sm:mb-32">
          <h2 className="text-xl font-bold text-[#1a1a1a] mb-8 sm:mb-12">52주 여정</h2>
          
          <div className="relative">
            {/* 데스크탑 선 */}
            <div className="hidden md:block absolute top-[45px] left-[12.5%] right-[12.5%] h-0.5 bg-[#D9D9D9] z-0" />
            
            {/* 모바일 선 */}
            <div className="md:hidden absolute top-4 bottom-4 left-[23px] w-0.5 bg-[#D9D9D9] z-0" />

            <div className="flex flex-col md:flex-row gap-8 md:gap-0 relative z-10">
              {journeyPhases.map((phase) => {
                const isActive = activePhase === phase.id;
                
                return (
                  <div key={phase.id} className="flex-1 flex flex-row md:flex-col items-start md:items-center relative group">
                    {/* 타임라인 노드 및 모바일 레이아웃 */}
                    <button
                      type="button"
                      onClick={() => setActivePhase(phase.id)}
                      className="flex md:flex-col items-center gap-4 md:gap-4 text-left md:text-center w-full focus:outline-none group"
                    >
                      {/* 노드 원형 마커 */}
                      <div className="relative flex-shrink-0 flex items-center justify-center w-12 h-12 md:w-16 md:h-16 rounded-full bg-white border-2 transition-all duration-300 z-10"
                           style={{ 
                             borderColor: isActive ? '#2563EB' : '#D9D9D9',
                             boxShadow: isActive ? '0 0 0 4px rgba(37, 99, 235, 0.1)' : 'none'
                           }}>
                        <div className={`w-3 h-3 md:w-4 md:h-4 rounded-full transition-colors duration-300 ${isActive ? 'bg-[#2563EB]' : 'bg-transparent group-hover:bg-gray-200'}`} />
                      </div>
                      
                      {/* 라벨 */}
                      <div className="flex flex-col">
                        <span className={`text-lg font-bold transition-colors duration-300 ${isActive ? 'text-[#2563EB]' : 'text-[#1a1a1a] group-hover:text-gray-600'}`}>
                          {phase.title}
                        </span>
                        <span className="text-sm font-medium text-[#666666] mt-1">
                          {phase.months}
                        </span>
                      </div>
                    </button>

                    {/* 모바일용 인라인 설명 카드 (선택된 항목 아래에 표시) */}
                    <div className={`md:hidden overflow-hidden transition-all duration-300 w-full pl-16 ${isActive ? 'max-h-48 opacity-100 mt-4' : 'max-h-0 opacity-0'}`}>
                      <div className="p-5 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] shadow-sm">
                        <p className="text-[#475569] text-sm leading-relaxed">
                          {phase.desc}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* 데스크탑용 하단 설명 카드 */}
            <div className="hidden md:block mt-12 bg-[#F8FAFC] rounded-2xl p-8 border border-[#E2E8F0] shadow-sm max-w-3xl mx-auto transition-all duration-500 animate-in fade-in zoom-in-95">
              <h3 className="text-lg font-bold text-[#2563EB] mb-3">{activePhaseData?.title}</h3>
              <p className="text-[#475569] leading-relaxed text-base">
                {activePhaseData?.desc}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
          {curriculumItems.map((item) => (
            <div 
              key={item.title} 
              className="group relative flex flex-col p-8 sm:p-10 rounded-2xl bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] hover:bg-gray-50 hover:border-blue-400 transition-all duration-500 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-60 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="mb-8 p-4 rounded-2xl bg-gray-50 w-fit border border-[#D9D9D9] group-hover:scale-110 transition-transform duration-500 relative z-10">
                <item.icon className="w-8 h-8 text-blue-600" />
              </div>
              
              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-4 tracking-tight relative z-10">
                {item.title}
              </h3>
              
              <p className="text-[#666666] leading-relaxed font-light mt-auto relative z-10">
                {item.description}
              </p>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
