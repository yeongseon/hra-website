"use client";

import React from "react";
import { Compass } from "lucide-react";
import { Briefcase } from "lucide-react";
import { FileText } from "lucide-react";


export function BenefitsSection() {
  return (
    <div className="flex flex-col gap-8 max-w-5xl mx-auto">

      {/* Benefit 1 */}
      <div className="grid md:grid-cols-2 rounded-3xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] md:min-h-[220px]">

        <div className="min-h-[220px] h-full bg-gray-200 flex items-center justify-center">
          <span className="text-gray-500">이미지 영역</span>
        </div>

        <div className="flex flex-col justify-center p-8 md:p-10">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
            <Compass className="w-7 h-7 text-blue-600" />
          </div>

          <h3 className="text-2xl font-bold text-[#1a1a1a] mb-4">
            수료증 및 추천서 수여
          </h3>

          <p className="text-[#666666] leading-8">
            1년의 과정을 마친 수료생에게는 공식 수료증과 함께 교수진이 직접 작성한 추천서가 발급됩니다.
          </p>
        </div>
      </div>

      {/* Benefit 2 */}
      <div className="grid md:grid-cols-2 rounded-3xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] md:min-h-[260px]">

        <div className="order-2 md:order-1 flex flex-col justify-center p-8 md:p-10">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
            <Briefcase className="w-7 h-7 text-blue-600" />
          </div>

          <h3 className="text-2xl font-bold text-[#1a1a1a] mb-4">
            진로 지도
          </h3>

          <p className="text-[#666666] leading-8">
            실무 경험이 풍부한 교수진과의 상담을 통해 자신의 방향을 구체화할 수 있습니다.
          </p>
        </div>

        <div className="order-1 md:order-2 min-h-[260px] h-full bg-gray-200 flex items-center justify-center">
          <span className="text-gray-500">이미지 영역</span>
        </div>
      </div>

      {/* Benefit 3 */}
      <div className="grid md:grid-cols-2 rounded-3xl overflow-hidden border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] md:min-h-[220px]">

        <div className="min-h-[220px] h-full bg-gray-200 flex items-center justify-center">
          <span className="text-gray-500">이미지 영역</span>
        </div>

        <div className="flex flex-col justify-center p-8 md:p-10">
          <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center mb-5">
            <FileText className="w-7 h-7 text-blue-600" />
          </div>

          <h3 className="text-2xl font-bold text-[#1a1a1a] mb-4">
            취업 알선
          </h3>

          <p className="text-[#666666] leading-8">
            HRA 네트워크와 선배 수료생들의 경험을 바탕으로 취업과 사회 진출을 지원합니다.
          </p>
        </div>
      </div>

    </div>
  );
}
