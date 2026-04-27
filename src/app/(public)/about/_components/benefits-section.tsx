"use client";

import React from "react";

export function BenefitsSection() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Benefit 1 */}
      <div className="group relative overflow-hidden rounded-2xl h-[320px] bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] cursor-default">
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-br from-blue-100 to-blue-50 transition-all duration-[400ms] ease-in-out group-hover:w-[45%]" />
        
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-[400ms] ease-in-out group-hover:opacity-0 z-10">
          <h3 className="text-xl font-bold text-[#1a1a1a]">수료증 및 추천서 수여</h3>
        </div>

        <div className="absolute inset-y-0 right-0 w-[55%] flex items-center justify-start p-6 opacity-0 group-hover:opacity-100 transition-all duration-[400ms] delay-150 ease-in-out z-10">
          <div className="flex flex-col translate-y-[10px] group-hover:translate-y-0 transition-transform duration-[400ms] delay-150 ease-in-out">
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-4">수료증 및 추천서 수여</h3>
            <p className="text-[#666666] leading-relaxed text-sm">
              1년의 과정을 마친 수료생에게는 공식 수료증과 함께 교수진이 직접 작성한 추천서가 발급됩니다.
            </p>
          </div>
        </div>
      </div>

      {/* Benefit 2 */}
      <div className="group relative overflow-hidden rounded-2xl h-[320px] bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] cursor-default">
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-br from-blue-100 to-blue-50 transition-all duration-[400ms] ease-in-out group-hover:w-[45%]" />
        
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-[400ms] ease-in-out group-hover:opacity-0 z-10">
          <h3 className="text-xl font-bold text-[#1a1a1a]">진로 지도</h3>
        </div>

        <div className="absolute inset-y-0 right-0 w-[55%] flex items-center justify-start p-6 opacity-0 group-hover:opacity-100 transition-all duration-[400ms] delay-150 ease-in-out z-10">
          <div className="flex flex-col translate-y-[10px] group-hover:translate-y-0 transition-transform duration-[400ms] delay-150 ease-in-out">
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-4">진로 지도</h3>
            <p className="text-[#666666] leading-relaxed text-sm">
              수료 후에도 HRA와의 연결은 끊기지 않습니다. 실무 경험이 풍부한 교수진과의 1:1 커리어 상담을 통해 자신의 방향을 구체화할 수 있습니다. 취업 준비 전략부터 이직, 창업까지 각자의 상황에 맞는 진로 설계를 함께 고민합니다.
            </p>
          </div>
        </div>
      </div>

      {/* Benefit 3 */}
      <div className="group relative overflow-hidden rounded-2xl h-[320px] bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] cursor-default">
        <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-br from-blue-100 to-blue-50 transition-all duration-[400ms] ease-in-out group-hover:w-[45%]" />
        
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-[400ms] ease-in-out group-hover:opacity-0 z-10">
          <h3 className="text-xl font-bold text-[#1a1a1a]">취업 알선</h3>
        </div>

        <div className="absolute inset-y-0 right-0 w-[55%] flex items-center justify-start p-6 opacity-0 group-hover:opacity-100 transition-all duration-[400ms] delay-150 ease-in-out z-10">
          <div className="flex flex-col translate-y-[10px] group-hover:translate-y-0 transition-transform duration-[400ms] delay-150 ease-in-out">
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-4">취업 알선</h3>
            <p className="text-[#666666] leading-relaxed text-sm">
              HRA는 지역 및 전국 파트너 기업과의 네트워크를 기반으로 수료생의 취업을 적극 지원합니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
