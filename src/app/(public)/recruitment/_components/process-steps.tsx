/*
 * 전형 프로세스 단계 카드 컴포넌트
 * - 사용 위치: src/app/(public)/recruitment/page.tsx
 * - 데스크톱: 3×2 지그재그 그리드 (→ → ↓ ← ←)
 * - 모바일: 수직 목록
 * - 설명글 항상 표시, hover 시 파란 테두리·배경으로 강조
 */

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

interface ProcessStep {
  label: string;
  title: string;
  description: string;
  note?: string;
}

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

const chevronCls = "size-6 shrink-0 text-[#2563EB]";

function ProcessCard({ step }: { step: ProcessStep }) {
  return (
    <div className="group w-full rounded-xl border border-[#D9D9D9] bg-white p-5 text-left shadow-sm transition-all duration-300 hover:border-blue-300 hover:bg-blue-50/40 hover:shadow-[0_4px_16px_rgba(37,99,235,0.10)]">
      <p className="text-xs font-bold tracking-widest text-[#2563EB]">
        {step.label}
      </p>

      <h3 className="mt-2 text-base font-bold text-[#1a1a1a] transition-colors duration-300 group-hover:text-[#2563EB]">
        {step.title}
      </h3>

      <div className="space-y-1.5 pb-1 pt-3">
        <p className="text-sm leading-relaxed text-[#666666]">
          {step.description}
        </p>
        {step.note && (
          <p className="text-xs text-[#2563EB]">* {step.note}</p>
        )}
      </div>
    </div>
  );
}

export function ProcessSteps() {
  return (
    <>
      {/* ── 데스크톱: 3×2 지그재그 그리드 ── */}
      <div className="hidden md:grid md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-start md:gap-x-3">

        {/* 1행: STEP 01 → STEP 02 → STEP 03 */}
        <ProcessCard step={steps[0]} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronRight className={chevronCls} />
        </div>
        <ProcessCard step={steps[1]} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronRight className={chevronCls} />
        </div>
        <ProcessCard step={steps[2]} />

        {/* ↓ 화살표: 5번째 열(STEP 03 아래)에만 배치 */}
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div aria-hidden="true" />
        <div className="flex items-center justify-center py-4">
          <ChevronDown className={chevronCls} />
        </div>

        {/* 2행: STEP 06 ← STEP 05 ← STEP 04 */}
        <ProcessCard step={steps[5]} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronLeft className={chevronCls} />
        </div>
        <ProcessCard step={steps[4]} />
        <div className="self-stretch flex items-center justify-center px-1">
          <ChevronLeft className={chevronCls} />
        </div>
        <ProcessCard step={steps[3]} />
      </div>

      {/* ── 모바일: 수직 목록 ── */}
      <div className="flex flex-col gap-3 md:hidden">
        {steps.map((step) => (
          <ProcessCard key={step.label} step={step} />
        ))}
      </div>
    </>
  );
}
