"use client";

import { ChevronDown, Phone } from "lucide-react";
import { useState } from "react";

const faqItems = [
  {
    question: "HRA는 어떤 프로그램인가요?",
    answer:
      "HRA(Human Renaissance Academy)는 인문학적 소양을 기반으로 실무 역량과 인성을 함께 성장시키는 1년 과정의 아카데미입니다.\n고전 읽기, 에세이 작성, 케이스 스터디, 스피치 훈련 등 다양한 교육 과정을 통해 비판적 사고력과 문제 해결 능력을 기르며, 실제 사회에서 필요한 역량을 체계적으로 함양하는 것을 목표로 합니다.",
  },
  {
    question: "어떤 사람들이 지원하면 좋나요?",
    answer:
      "• AI 시대에도 나만의 생각을 갖고 싶은 사람\n• 기업에서 하는 실전 프로젝트를 경험하고 싶은 사람\n• 스피치, 영어 실력을 한 번에 향상시키고 싶은 사람\n\nHRA는 단순한 지식 습득이 아닌 '성장'을 목표로 하는 프로그램입니다.\n자기계발에 대한 의지가 있고, 1년 동안 꾸준히 참여하며 끝까지 수료하고자 하는 책임감 있는 분들, 그리고 다양한 사람들과 협업하며 배우고 성장하고자 하는 분들에게 적합합니다.",
  },
  {
    question: "지원 자격은 어떻게 되나요?",
    answer:
      "만 19세 이상이며, 수업 특성상 대면 활동이 많기 때문에 제주에 거주 중인 청년이라면 지원 가능합니다.\n그 외의 별도 자격 조건은 없으며, HRA에서 열정을 가지고 적극적으로 참여할 수 있는 인재를 찾고 있습니다.",
  },
  {
    question: "선발 과정은 어떻게 진행되나요?",
    answer:
      "지원 기간 내 지원서를 제출한 후, 배정된 면접 일정과 장소 안내에 따라 면접이 진행됩니다.\n면접은 제출한 지원서를 기반으로 진행되며, HRA에서 성실하게 활동할 수 있는지, 프로그램을 끝까지 수료할 수 있는지 등을 종합적으로 평가합니다.\n이후 합격 여부는 개별 안내를 통해 전달됩니다.",
  },
  {
    question: "HRA 활동 기간은 얼마나 되나요?",
    answer:
      "HRA의 공식 활동 기간은 약 1년입니다.\n\n• 6월: 오리엔테이션 및 사전학습\n• 9~12월: 전반기 수업 (약 15주)\n• 1~2월: 겨울캠프 사전 준비 및 참여\n• 3~6월: 하반기 수업 (약 15주)\n• 9월: 수료식\n\n이외에도 수료 이후 다음 기수를 위한 활동과 선후배 간 네트워킹이 지속적으로 이루어집니다.",
  },
  {
    question: "학교나 아르바이트와 병행이 가능한가요?",
    answer:
      "네, 가능합니다.\nHRA는 매주 토요일 정규 수업이 진행되며, 해당 시간을 제외하고 개인 일정 조정이 가능합니다.\n다만, 케이스 스터디 및 팀 활동 과정에서 조별 모임이 추가적으로 있을 수 있으므로 팀원들과의 일정 조율이 필요합니다.",
  },
  {
    question: "HRA 수료 후 어떤 도움이 되나요?",
    answer:
      "재학생의 경우, HRA에서의 경험을 바탕으로 다양한 대외활동 및 공모전에 참여하는 데 유리한 기반을 마련할 수 있습니다.\n또한 동기 및 선배들과 함께 활동하며 협업 기회를 확장할 수 있습니다.\n\n취업 준비생의 경우, 실무 경험이 풍부한 교수진을 통해 취업 상담 및 진로 컨설팅을 받을 수 있으며, 자신의 진로 방향을 보다 구체화할 수 있습니다.",
  },
  {
    question: "취업에 실제로 도움이 되나요?",
    answer:
      "HRA 수료생 취업 조사 결과, 약 75%가 취업에 성공한 것으로 나타났습니다.\nHRA에서의 학습 과정은 실무 경험뿐만 아니라 문제 해결 능력, 협업 능력 등 다양한 역량을 함께 기르는 데 중점을 두고 있습니다.\n이러한 경험은 취업 준비뿐 아니라 실제 업무 수행에도 도움이 되었다는 수료생들의 의견이 많습니다.",
  },
  {
    question: "HRA의 분위기는 어떤가요?",
    answer:
      "기수마다 분위기에는 차이가 있지만, 전반적으로 배움에 대한 의지와 열정을 가진 사람들이 모이는 환경입니다.\n같은 목표를 가진 구성원들과 함께 1년간 활동하며 자연스럽게 동기부여를 받고, 개인의 성장에 긍정적인 영향을 받을 수 있습니다.",
  },
  {
    question: "수료 후에도 활동이 이어지나요?",
    answer:
      "네, 수료 이후에도 활동은 계속 이어집니다.\n수료생들은 다음 기수를 위한 겨울캠프 준비에 참여하며, 이후에도 다양한 행사와 프로그램을 통해 HRA와 지속적으로 연결됩니다.",
  },
  {
    question: "네트워크 형성이 가능한가요?",
    answer:
      "HRA는 약 20년간 운영되며 많은 수료생을 배출해왔습니다.\n동기 간 네트워크뿐만 아니라 선후배 간의 교류도 활발하게 이루어지고 있으며, 송년회, 수료식 등 다양한 행사에서 자연스럽게 인적 네트워크를 확장할 수 있습니다.",
  },
  {
    question: "지원서 작성 팁이 있나요?",
    answer:
      "지원서는 요청된 형식에 맞춰 성실하게 작성하는 것이 중요합니다.\n작성된 내용은 면접에서도 활용되기 때문에, 자신의 경험과 생각을 진솔하게 담아내는 것이 좋습니다.",
  },
  {
    question: "면접은 어떤 방식으로 진행되나요?",
    answer:
      "면접은 다대일 형태로 진행되며, 현재 수업을 진행하는 교수진과 운영진이 함께 참여합니다.\n제출한 지원서를 바탕으로 약 15~20분간 진행되며, 지원자의 참여 의지와 적합성을 중심으로 평가가 이루어집니다.",
  },
  {
    question: "추가적으로 궁금한 점은 어디에 문의할 수 있나요?",
    answer:
      "추가 문의사항은 FAQ에 안내된 모집위원장 연락처 또는 인스타그램 DM을 통해 문의해주시기 바랍니다.\n많은 관심 부탁드립니다!",
  },
  {
    question: "여기까지 읽은 당신! HRA에 들어와야겠지? 😎",
    answer:
      "축하합니다, 이스터에그를 발견하셨군요! 🎉 여기까지 꼼꼼히 읽어보셨다면 이미 HRA에 관심이 있으시다는 뜻이겠죠? 지금 바로 지원해보세요!",
  },
] as const;

type FaqContentProps = {
  contactText: string;
};

export function FaqContent({ contactText }: FaqContentProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const [showContact, setShowContact] = useState(false);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
      <section className="py-16 text-center sm:py-20">
        <h1 className="text-[40px] font-bold leading-tight text-[#1a1a1a]">자주 묻는 질문</h1>
        <div className="mx-auto mt-3 mb-3 h-1 w-12 bg-[var(--brand)]" />
        <p className="mt-5 text-lg leading-relaxed text-[#666666]">HRA에 대해 궁금한 점을 확인하세요</p>
      </section>

      <div className="relative my-8 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setShowContact(!showContact)}
          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-blue-600 transition-colors hover:bg-blue-700"
          aria-label="담당자에게 연락하기"
        >
          <Phone className="h-6 w-6 text-white" />
        </button>
        <span className="mt-2 text-sm text-[#666666]">담당자에게 연락하기</span>

        <div
          className={`absolute top-full mt-4 z-10 transition-all duration-300 ease-out ${
            showContact ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
          }`}
        >
          <div className="relative whitespace-nowrap rounded-xl border border-[#D9D9D9] bg-white px-6 py-4 text-sm text-[#666666] shadow-[var(--shadow-soft)]">
            <div className="absolute -top-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-t border-l border-[#D9D9D9] bg-white" />
            <span className="relative z-10">{contactText}</span>
          </div>
        </div>
      </div>

      <section className="space-y-4">
        {faqItems.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <div
              key={item.question}
              className="rounded-2xl border border-[#D9D9D9] bg-white px-5 py-2 shadow-[var(--shadow-soft)] sm:px-7"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(isOpen ? null : index)}
                className="flex w-full items-center justify-between gap-4 py-5 text-left"
                aria-expanded={isOpen}
                aria-controls={`faq-panel-${index}`}
              >
                <span className="text-lg font-semibold text-[#1a1a1a]">{item.question}</span>
                <ChevronDown
                  className={`h-5 w-5 flex-shrink-0 text-blue-600 transition-transform duration-300 ${isOpen ? "rotate-180" : "rotate-0"}`}
                />
              </button>

              <div
                id={`faq-panel-${index}`}
                className={`grid transition-all duration-300 ease-out ${isOpen ? "grid-rows-[1fr] pb-5" : "grid-rows-[0fr]"}`}
              >
                <div className="overflow-hidden">
                  <div className="border-t border-[#D9D9D9] pt-5">
                    <p className="whitespace-pre-line text-lg leading-relaxed text-[#666666]">{item.answer}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
