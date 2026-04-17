/**
 * 홈페이지 수료생 이야기 슬라이더를 담당하는 클라이언트 컴포넌트입니다.
 * 현재 슬라이드 상태와 이전·다음 이동, 인디케이터 클릭을 이 파일에 모아 기존 캐러셀 상호작용을 유지합니다.
 */

"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

const alumniData = [
  {
    id: "alumni-17",
    gradient: "from-amber-700 via-amber-800 to-stone-900",
    cohort: "17기 수료생",
    quote: "한계까지 도전하고, 성장으로 보답하다",
    image: "/images/cohort-17.jpeg"
  },
  {
    id: "alumni-18",
    gradient: "from-blue-700 via-blue-800 to-slate-900",
    cohort: "18기 수료생",
    quote: "본질을 묻는 힘, 현업에서의 차이를 만들다",
    image: null
  },
  {
    id: "alumni-19",
    gradient: "from-emerald-700 via-emerald-800 to-slate-900",
    cohort: "19기 수료생",
    quote: "평생을 함께할 최고의 동료들을 얻었습니다",
    image: null
  }
];

export function AlumniCarousel() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((previousSlide) => (previousSlide + 1) % alumniData.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((previousSlide) => (previousSlide - 1 + alumniData.length) % alumniData.length);
  }, []);

  return (
    <section className="py-24 px-4 max-w-7xl mx-auto w-full border-t border-[#D9D9D9]">
      <div className="flex flex-col items-center text-center mb-16">
        <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
          수료생 이야기
        </h2>
        <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-4 mb-4" />
      </div>

      <div className="relative border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden bg-white">
        <div className="flex transition-transform duration-700 ease-in-out h-auto md:h-[500px]" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
          {alumniData.map((alumni) => (
            <div key={alumni.id} className="min-w-full relative h-full flex flex-col md:flex-row">
              <div className={`w-full md:w-[60%] h-64 md:h-full relative bg-gradient-to-br ${alumni.gradient} border-r border-[#D9D9D9]`}>
                {alumni.image ? (
                  <Image src={alumni.image} alt={alumni.cohort} fill className="object-cover" />
                ) : (
                  <div className="w-full h-full bg-black/10" />
                )}
              </div>

              <div className="w-full md:w-[40%] p-6 md:p-16 flex flex-col justify-center bg-white relative">
                <div className="inline-block px-4 py-1.5 bg-gray-100 text-gray-800 font-semibold text-lg rounded-full mb-6 w-max">
                  {alumni.cohort}
                </div>

                <h3 className="text-2xl md:text-4xl font-bold text-[#1a1a1a] leading-snug mb-8">
                  &quot;{alumni.quote}&quot;
                </h3>

                <Link href="/alumni" className="text-[var(--brand)] font-semibold flex items-center hover:underline transition-colors mt-auto md:mt-0 w-max text-lg">
                  자세히 읽어보기 <ChevronRight className="w-5 h-5 ml-1" />
                </Link>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={prevSlide}
          className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-full flex items-center justify-center text-gray-800 hover:bg-gray-50 transition-colors z-10"
          aria-label="이전 슬라이드"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        <button
          type="button"
          onClick={nextSlide}
          className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 md:w-12 md:h-12 bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-full flex items-center justify-center text-gray-800 hover:bg-gray-50 transition-colors z-10"
          aria-label="다음 슬라이드"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-3">
          {alumniData.map((alumni, index) => (
            <button
              type="button"
              key={`nav-${alumni.id}`}
              onClick={() => setCurrentSlide(index)}
              className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                currentSlide === index ? "bg-[#1a1a1a] w-8" : "bg-[#D9D9D9] hover:bg-gray-400"
              }`}
              aria-label={`슬라이드 ${index + 1}로 이동`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
