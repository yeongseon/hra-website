"use client";

import { ChevronDown, Phone } from "lucide-react";
import { useState } from "react";

type FaqItemData = {
  id: string;
  question: string;
  answer: string;
};

type FaqContentProps = {
  contactText: string;
  items: FaqItemData[];
};

export function FaqContent({ contactText, items }: FaqContentProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 lg:px-8">
      <section className="py-16 text-center sm:py-20">
        <h1 className="text-[40px] font-bold leading-tight text-[#1a1a1a]">FAQ</h1>
        <div className="mx-auto mt-3 mb-3 h-1 w-12 bg-[var(--brand)]" />
        <p className="mt-5 text-lg leading-relaxed text-[#666666]">HRA에 대해 궁금한 점을 확인하세요</p>
      </section>

      {/* 담당자 연락처 — hover 시 아이콘 위에 툴팁 등장 */}
      <div className="relative my-8 flex flex-col items-center">
        <div className="group relative flex flex-col items-center">
          {/* 툴팁: 아이콘 위쪽에 hover 시 부드럽게 등장 */}
          <div
            className="pointer-events-none absolute bottom-full left-1/2 mb-3 -translate-x-1/2 translate-y-1 opacity-0 transition-all duration-300 ease-out group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100"
            style={{ zIndex: 10 }}
          >
            <div className="relative whitespace-nowrap rounded-xl border border-[#D9D9D9] bg-white px-6 py-4 text-sm text-[#666666] shadow-[var(--shadow-soft)]">
              {/* 아래를 가리키는 삼각형 화살표 */}
              <div className="absolute -bottom-2 left-1/2 h-4 w-4 -translate-x-1/2 rotate-45 border-b border-r border-[#D9D9D9] bg-white" />
              <span className="relative z-10">{contactText}</span>
            </div>
          </div>

          <button
            type="button"
            className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-blue-600 transition-colors hover:bg-blue-700"
            aria-label="담당자에게 연락하기"
          >
            <Phone className="h-6 w-6 text-white" />
          </button>
        </div>
        <span className="mt-2 text-sm text-[#666666]">담당자에게 연락하기</span>
      </div>

      <section className="space-y-4">
        {items.map((item, index) => {
          const isOpen = openIndex === index;

          return (
            <div
              key={item.id}
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
