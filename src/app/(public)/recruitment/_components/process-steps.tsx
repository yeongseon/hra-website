/*
 * 전형 프로세스 단계 카드 컴포넌트
 * - 사용 위치: src/app/(public)/recruitment/page.tsx
 * - 데스크톱: 3×2 지그재그 그리드, CSS hover로 설명 노출 (→ → ↓ ← ←)
 * - 모바일: 수직 아코디언, 탭으로 설명 토글
 * - height 애니메이션: grid-template-rows 0fr→1fr 전환 방식 사용
 */
"use client";

import { useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProcessStep {
  label: string;        // "STEP 01"
  title: string;        // "지원서 접수"
  description: string;  // 상세 설명
  note?: string;        // 비고 항목 (별표 표시)
}

/* 전형 6단계 데이터 */
const steps: ProcessStep[] = [
  {
    label: "STEP 01",
    title: "지원서 접수",
    description:
      "홈페이지 내 지원서에 자기소개, 지원동기, 활동 목표를 성실하게 작성하여 제출합니다.",
  },
  {
    label: "STEP 02",
    title: "서류 심사",
    description: "지원자의 성장 가능성, 진정성을 중심으로 평가합니다.",
    note: "서류 합격 시, 개별 연락으로 안내",
  },
  {
    label: "STEP 03",
    title: "면접 진행",
    description: "3:1 방식으로 진행하며, 지원자의 참여 의지를 확인합니다.",
    note: "상세일정은 개별 연락으로 안내",
  },
  {
    label: "STEP 04",
    title: "최종 합격",
    description: "서류 및 면접 결과를 종합하여 최종 합격자를 선발합니다.",
    note: "합격자 발표는 개별 연락으로 안내",
  },
  {
    label: "STEP 05",
    title: "사전 학습",
    description: "최종 합격자를 대상으로 2일간 입학 전 사전 학습이 진행됩니다.",
    note: "신규 기수 필참",
  },
  {
    label: "STEP 06",
    title: "입학식",
    description: "수료식과 함께 9월에 진행하며, 새로운 기수의 시작을 축하합니다.",
    note: "신규 기수 필참",
  },
];

/* 화살표 공통 클래스 — gray-400 계열로 존재감 강화 */
const chevronCls = "size-6 shrink-0 text-[#9CA3AF]";

interface ProcessCardProps {
  step: ProcessStep;
  isOpen: boolean;    // 모바일 아코디언 열림 여부
  onClick: () => void;
}

/* 개별 전형 카드 — 데스크톱 hover / 모바일 click 모두 처리 */
function ProcessCard({ step, isOpen, onClick }: ProcessCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={isOpen}
      className={cn(
        /* 기본 카드 */
        "group/card w-full rounded-xl border bg-white p-5 text-left",
        "shadow-sm transition-all duration-300",
        /* 열림/hover 상태 — border·shadow 강조 */
        isOpen
          ? "border-blue-300 shadow-[0_4px_16px_rgba(37,99,235,0.10)]"
          : "border-[#D9D9D9] hover:border-blue-300 hover:shadow-[0_4px_16px_rgba(37,99,235,0.10)]",
      )}
    >
      {/* STEP 라벨 — hover 여부와 무관하게 항상 브랜드 블루로 고정 */}
      <p className="text-xs font-bold tracking-widest text-[#2563EB]">
        {step.label}
      </p>

      {/* 단계 제목 */}
      <h3
        className={cn(
          "mt-2 text-base font-bold transition-colors duration-300",
          isOpen
            ? "text-[#2563EB]"
            : "text-[#1a1a1a] group-hover/card:text-[#2563EB]",
        )}
      >
        {step.title}
      </h3>

      {/*
       * 설명 영역 — grid-template-rows 0fr → 1fr 전환으로 높이 자연스럽게 확장
       * - 바깥 div: grid rows 전환 담당
       * - 안쪽 div: overflow-hidden + min-h-0 (0fr에서 내용이 보이지 않도록)
       * - 텍스트: opacity + translateY로 등장 효과 추가 (delay로 순차 노출)
       */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-in-out",
          isOpen
            ? "grid-rows-[1fr]"
            : "grid-rows-[0fr] group-hover/card:grid-rows-[1fr]",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-1.5 pb-1 pt-3">
            {/* 본문 설명 */}
            <p
              className={cn(
                "text-sm leading-relaxed text-[#666666]",
                "transition-all duration-300 delay-100",
                isOpen
                  ? "translate-y-0 opacity-100"
                  : "translate-y-1 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100",
              )}
            >
              {step.description}
            </p>

            {/* 비고 항목 — 있는 단계만 표시 */}
            {step.note && (
              <p
                className={cn(
                  "text-xs text-[#2563EB]",
                  "transition-all duration-[300ms] delay-[160ms]",
                  isOpen
                    ? "translate-y-0 opacity-100"
                    : "translate-y-1 opacity-0 group-hover/card:translate-y-0 group-hover/card:opacity-100",
                )}
              >
                * {step.note}
              </p>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

export function ProcessSteps() {
  /* 모바일 아코디언: 한 번에 하나의 카드만 열림 */
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) =>
    setOpenIndex((prev) => (prev === index ? null : index));

  return (
    <>
      {/* ── 데스크톱: 3×2 지그재그 그리드 ── */}
      {/*
       * 열 구성: 카드(1fr) | 화살표(auto) | 카드(1fr) | 화살표(auto) | 카드(1fr)
       * items-start: hover로 카드 하나가 늘어나도 나머지 카드가 함께 늘지 않음
       */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start md:gap-x-3">

        {/* 1행: STEP 01 →  STEP 02 → STEP 03 */}
        <ProcessCard step={steps[0]} isOpen={openIndex === 0} onClick={() => toggle(0)} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronRight className={chevronCls} />
        </div>
        <ProcessCard step={steps[1]} isOpen={openIndex === 1} onClick={() => toggle(1)} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronRight className={chevronCls} />
        </div>
        <ProcessCard step={steps[2]} isOpen={openIndex === 2} onClick={() => toggle(2)} />

        {/* ↓ 화살표 행: 5번째 열(STEP 03 아래)에만 배치, 나머지는 빈 셀 */}
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div className="flex items-center justify-center py-4">
          <ChevronDown className={chevronCls} />
        </div>

        {/* 2행: STEP 06(입학식) ← STEP 05(사전학습) ← STEP 04(최종합격) */}
        {/* 시각 순서는 06→05→04이지만 프로세스 흐름은 04→05→06 (← 화살표 방향) */}
        <ProcessCard step={steps[5]} isOpen={openIndex === 5} onClick={() => toggle(5)} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronLeft className={chevronCls} />
        </div>
        <ProcessCard step={steps[4]} isOpen={openIndex === 4} onClick={() => toggle(4)} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronLeft className={chevronCls} />
        </div>
        <ProcessCard step={steps[3]} isOpen={openIndex === 3} onClick={() => toggle(3)} />
      </div>

      {/* ── 모바일: 수직 아코디언 목록 ── */}
      <div className="flex flex-col gap-3 md:hidden">
        {steps.map((step, i) => (
          <ProcessCard
            key={step.label}
            step={step}
            isOpen={openIndex === i}
            onClick={() => toggle(i)}
          />
        ))}
      </div>
    </>
  );
}
