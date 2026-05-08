"use client";

import { useState } from "react";
import { BookOpen, Briefcase, FileSearch, Mic, Building, HeartHandshake, Tent } from "lucide-react";

const curriculumItems = [
  {
    title: "고전 읽기",
    icon: BookOpen,
    description: "HRA의 고전 읽기 과정은 국내외 대학에서 권장하는 고전을 바탕으로 진행됩니다. 참가자들은 독서 후 발표와 토론을 통해 내용을 깊이 이해하며, 사고력과 글쓰기·발표 역량을 함께 키워나갑니다.",
  },
  {
    title: "경영서",
    icon: Briefcase,
    description: "경영서 학습은 기업과 조직, 시장의 구조를 이해하기 위한 과정입니다. 참가자들은 다양한 경영 도서를 바탕으로 내용을 분석하고 토론하며, 실무적 시각과 통합적인 사고력을 키워나갑니다.",
  },
  {
    title: "케이스스터디",
    icon: FileSearch,
    description: "케이스스터디는 실제 기업 및 사회 사례를 바탕으로 문제를 분석하고 해결 방안을 도출하는 과정입니다. 참가자들은 팀 토론과 발표를 통해 논리적 사고력과 설득력 있는 의사소통 능력, 실무 중심의 문제 해결 역량을 키워나갑니다.",
  },
  {
    title: "특강",
    icon: Mic,
    description: "HRA에서는 다양한 분야의 전문가를 초청해 특강을 진행합니다. 스피치와 영어 세션, 취업 특강 등을 통해 표현력과 커뮤니케이션 능력, 진로 및 취업 역량을 균형 있게 키워나갈 수 있습니다.",
  },
  {
    title: "하계 인턴",
    icon: Building,
    description: "하계 인턴 과정은 학습한 내용을 실제 현장에서 경험해볼 수 있는 과정입니다. 참가자들은 기업 및 기관에서의 실무 경험을 통해 업무 환경을 이해하고, 이론과 실무를 연결하며 진로 방향을 구체화할 수 있습니다.",
  },
  {
    title: "봉사활동",
    icon: HeartHandshake,
    description: "HRA는 일정 시간 이상의 봉사활동을 통해 사회적 책임과 공동체 의식을 함양하는 것을 중요하게 생각합니다. 참가자들은 다양한 봉사활동에 참여하며 타인과 사회에 대한 이해를 넓히고, 성숙한 시민으로서의 태도를 기르게 됩니다.",
  },
  {
    title: "겨울캠프",
    icon: Tent,
    description: "겨울캠프는 일정 기간 합숙하며 집중적으로 학습과 토론을 진행하는 프로그램입니다. 참가자들은 교육에 몰입하며 사고력과 문제 해결 능력을 키우고, 한 단계 더 성장하는 경험을 하게 됩니다.",
  },
];

const journeyPhases = [
  {
  id: "orientation",
  title: "오리엔테이션 및 사전학습",
  months: "6월",
  desc: "HRA의 오리엔테이션은 앞으로 이어질 1년간의 여정을 처음 시작하는 시간입니다. HRA의 교육 방향성과 운영 방식, 활동 목표를 이해하며 교수진과 동기들을 처음 만나게 됩니다. 단순한 안내를 넘어, 앞으로 함께 성장해나갈 공동체의 첫 시작을 경험하는 과정입니다.",
  },
  {
  id: "entrance",
  title: "입학식",
  months: "9월",
  desc: "HRA의 입학식은 새로운 기수의 시작을 공식적으로 알리는 자리입니다. 선배 기수와 교수진, 동기들이 함께 모여 새로운 출발을 축하하며 HRA 공동체의 일원이 되는 의미를 되새기게 됩니다. 입학식은 앞으로의 성장과 도전을 다짐하는 첫 번째 공식 행사입니다.",
  },
  {
    id: "first",
    title: "전반기",
    months: "9월 - 12월",
    desc: "HRA의 전반기는 단순한 학습 기간이 아닌, 스스로를 돌아보고 성장의 기반을 다지는 시간입니다. 전반기 15주 동안의 과정은 이후 겨울캠프와 하반기 활동을 이어가기 위한 가장 중요한 성장의 출발점이 됩니다.",
  },
  {
    id: "winter",
    title: "겨울캠프",
    months: "1월 - 2월",
    desc: "HRA의 겨울캠프는 7박 8일간 진행되는 합숙형 집중 프로그램으로, 한계를 넘어 스스로를 성장시키는 HRA의 핵심 과정입니다. 짧지만 밀도 높은 시간 속에서 서로를 의지하고 함께 목표를 완수하는 경험은 강한 유대감과 성취감을 만들어냅니다. 겨울캠프는 단순한 행사가 아니라, 자신의 가능성을 확인하고 더 큰 도전을 준비하는 성장의 전환점이 됩니다.",
  },
  {
    id: "second",
    title: "하반기",
    months: "3월 - 6월",
    desc: "HRA의 하반기는 전반기와 겨울캠프를 통해 쌓아온 경험과 역량을 실제 성장으로 연결하는 심화 과정입니다. 하반기 과정은 단순한 학습을 넘어, HRA에서의 배움을 삶과 커리어 속에서 실천할 수 있는 사람으로 성장해가는 마지막 단계입니다.",
  },
  {
    id: "graduation",
    title: "수료식",
    months: "9월",
    desc: "HRA의 수료식은 1년간의 여정을 마무리하고 새로운 시작을 함께 나누는 자리입니다. 전반기 수업부터 겨울캠프, 하반기 과정까지 치열하게 성장해온 시간들을 돌아보며, 수료생들은 서로의 노력과 변화를 함께 축하하게 됩니다.",
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
            <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
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
