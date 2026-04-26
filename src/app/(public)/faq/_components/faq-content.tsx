"use client";

import { ChevronDown, Phone } from "lucide-react";
import { useState } from "react";

const faqItems = [
  {
    question: "HRA는 어떤 프로그램인가요?",
    answer:
      "HRA(Human Renaissance Academy)는 대학생을 위한 1년 과정의 인문·비즈니스 통합 교육 프로그램입니다. 고전 읽기, 토론, 케이스 스터디, 특강 등을 통해 사고력과 실천력을 기릅니다.",
  },
  {
    question: "수업은 언제, 어디서 진행되나요?",
    answer:
      "매주 토요일 09:00~18:00에 제주대학교에서 진행됩니다. 교육 기간은 매년 9월부터 다음 해 8월까지 약 1년입니다.",
  },
  {
    question: "수업료가 있나요?",
    answer: "아니요. HRA는 비영리(NPO) 기반으로 운영되며 수업료는 무료입니다. 단, 교재비와 캠프 참가비 등 실비가 발생할 수 있습니다.",
  },
  {
    question: "지원 자격은 어떻게 되나요?",
    answer:
      "제주 지역 대학에 재학 중인 학생이면 누구나 지원할 수 있습니다. 전공 제한은 없으며, 성장에 대한 열정과 배움에 대한 진심이 가장 중요합니다.",
  },
  {
    question: "선발 과정은 어떻게 이루어지나요?",
    answer:
      "서류 접수 → 1차 서류 심사 → 2차 면접 → 최종 합격 순으로 진행됩니다. 면접은 지원자의 동기와 가치관을 중심으로 평가합니다.",
  },
  {
    question: "1년 과정 동안 어떤 내용을 배우나요?",
    answer:
      "전반기(9월~12월)에는 고전 읽기·토론, 후반기(3월~6월)에는 케이스 스터디·비즈니스 실습 위주로 진행됩니다. 겨울·여름 캠프와 수시 특강도 포함됩니다.",
  },
  {
    question: "고전 읽기에서는 어떤 책을 읽나요?",
    answer:
      "동서양 고전을 폭넓게 다룹니다. 플라톤의 《국가》, 아리스토텔레스의 《니코마코스 윤리학》, 사마천의 《사기》, 공자의 《논어》 등 매 기수마다 커리큘럼이 업데이트됩니다.",
  },
  {
    question: "케이스 스터디는 어떤 방식으로 진행되나요?",
    answer:
      "하버드 비즈니스 스쿨(HBS) 방식을 차용하여, 실제 기업 사례를 분석하고 팀별로 전략을 수립·발표합니다. 현직 전문가 교수진이 직접 지도합니다.",
  },
  {
    question: "수료 후 어떤 혜택이 있나요?",
    answer:
      "수료증 수여, 멘토 교수진의 추천서 제공, 진로 상담 및 취업 연계를 지원합니다. 또한 HRA 동문 네트워크를 통해 졸업 후에도 지속적인 교류가 이루어집니다.",
  },
  {
    question: "중도 포기하면 어떻게 되나요?",
    answer:
      "1년 과정의 약 80% 이상 출석해야 수료 자격이 부여됩니다. 부득이한 사유로 중도 이탈 시 별도 패널티는 없지만, 수료증은 발급되지 않습니다.",
  },
  {
    question: "다른 학교 학생과도 함께 수업하나요?",
    answer:
      "네. HRA는 대학 연합 프로그램으로 제주 지역 여러 대학의 학생들이 함께합니다. 다양한 전공·배경의 동기들과 교류하는 것이 HRA의 큰 장점입니다.",
  },
  {
    question: "교수진은 어떤 분들인가요?",
    answer:
      "언론, 경영, 외교, 교육, IT 등 다양한 분야의 현직·전직 전문가들이 재능기부로 참여합니다. 교수진 소개 페이지에서 자세히 확인할 수 있습니다.",
  },
  {
    question: "추가 문의는 어디로 하면 되나요?",
    answer:
      "이 페이지 상단의 '담당자에게 연락하기' 버튼을 눌러 현기수 담당자에게 직접 연락하실 수 있습니다. 또는 HRA 공식 인스타그램(@hra_jeju)으로 DM을 보내주세요.",
  },
  {
    question: "HRA의 숨겨진 전통이 있나요? 🥚",
    answer:
      "축하합니다, 이스터에그를 발견하셨군요! 🎉 HRA에는 '첫 수업 날 선배 기수가 후배에게 손편지를 전달하는' 전통이 있습니다. 1년 뒤 수료식에서 그 편지를 다시 읽으면… 음, 직접 경험해 보세요.",
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
                    <p className="text-lg leading-relaxed text-[#666666]">{item.answer}</p>
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
