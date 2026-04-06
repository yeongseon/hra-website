"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

const faqItems = [
  {
    question: "HRA는 어떤 프로그램인가요?",
    answer:
      "HRA(Human Renaissance Academy)는 대학생을 위한 1년 과정의 교육 프로그램입니다. 고전 읽기, 토론, 케이스 스터디, 특강 등을 통해 사고력과 실천력을 기릅니다.",
  },
  {
    question: "수업은 언제, 어디서 진행되나요?",
    answer:
      "매주 토요일 09:00~18:00에 제주대학교에서 진행됩니다. 교육 기간은 매년 9월부터 다음 해 8월까지 총 52주입니다.",
  },
  {
    question: "수업료가 있나요?",
    answer: "아니요, HRA는 비영리(NPO) 기반으로 운영되며 수업료는 무료입니다.",
  },
  {
    question: "지원 자격은 어떻게 되나요?",
    answer:
      "대학교 재학생 또는 졸업생이면 누구나 지원할 수 있습니다. 성장에 대한 열정과 배움에 대한 진심이 가장 중요합니다.",
  },
  {
    question: "수료 후 어떤 혜택이 있나요?",
    answer:
      "수료증 및 추천서 수여, 진로 지도, 취업 알선 등의 혜택이 제공됩니다. 또한 HRA 동문 네트워크를 통해 지속적인 교류가 이루어집니다.",
  },
  {
    question: "면접은 어떻게 진행되나요?",
    answer:
      "서류 심사 통과 후 면접이 진행됩니다. 면접 일정은 현기수가 별도로 관리하며, 개별 안내됩니다.",
  },
];

export default function FaqPage() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
      <section className="py-16 sm:py-20 text-center">
        <h1 className="text-[40px] font-bold leading-tight text-[#1a1a1a]">자주 묻는 질문</h1>
        <div className="mx-auto mt-[25px] mb-[5px] h-1 w-12 bg-[var(--brand)]" />
        <p className="mt-5 text-lg leading-relaxed text-[#666666]">HRA에 대해 궁금한 점을 확인하세요</p>
      </section>

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
