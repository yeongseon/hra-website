"use client";

import React from "react";

export function BenefitsSection() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto">
      {/* Benefit 1 */}
      <div className="rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-400 to-blue-600" />
        <div className="p-8 md:p-10">
          <h3 className="text-xl font-bold text-[#1a1a1a] mb-4">수료증 및 추천서 수여</h3>
          <p className="text-[#666666] leading-relaxed">
            1년의 과정을 마친 수료생에게는 공식 수료증과 함께 교수진이 직접 작성한 추천서가
            발급됩니다. 수료증은 HRA의 교육 과정을 성실히 이수했음을 공식적으로 증명하며,
            추천서는 각 수료생의 성장과 역량을 구체적으로 기술해 취업·진학·대외 활동에
            실질적인 도움이 됩니다.
          </p>
        </div>
      </div>

      {/* Benefit 2 */}
      <div className="rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-400 to-blue-600" />
        <div className="p-8 md:p-10">
          <h3 className="text-xl font-bold text-[#1a1a1a] mb-4">진로 지도</h3>
          <p className="text-[#666666] leading-relaxed">
            수료 후에도 HRA와의 연결은 끊기지 않습니다. 실무 경험이 풍부한 교수진과의 1:1
            커리어 상담을 통해 자신의 방향을 구체화할 수 있습니다. 취업 준비 전략부터 이직,
            창업까지 각자의 상황에 맞는 진로 설계를 함께 고민합니다. 단순한 정보 제공을 넘어,
            실질적인 행동 계획을 세우고 실천할 수 있도록 지속적으로 지원합니다.
          </p>
        </div>
      </div>

      {/* Benefit 3 */}
      <div className="rounded-2xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] overflow-hidden">
        <div className="h-1.5 w-full bg-gradient-to-r from-blue-400 to-blue-600" />
        <div className="p-8 md:p-10">
          <h3 className="text-xl font-bold text-[#1a1a1a] mb-4">취업 알선</h3>
          <p className="text-[#666666] leading-relaxed">
            HRA는 지역 및 전국 파트너 기업과의 네트워크를 기반으로 수료생의 취업을 적극
            지원합니다. 졸업 후에도 HRA 동문 커뮤니티와 연결되어 선배 수료생들의 경험과
            인맥을 활용할 수 있으며, 기업 측과의 매칭 기회를 통해 원활한 사회 진출을
            돕습니다.
          </p>
        </div>
      </div>
    </div>
  );
}
