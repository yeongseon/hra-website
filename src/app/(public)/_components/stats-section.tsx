/**
 * 홈페이지 성과 섹션의 숫자 애니메이션을 담당하는 클라이언트 컴포넌트입니다.
 * IntersectionObserver로 노출 시점을 감지하고 정수·소수 카운트업을 분리해 기존 시각 효과를 그대로 유지합니다.
 */

"use client";

import { useEffect, useRef, useState } from "react";

type AnimatedCountProps = {
  end: number;
  duration?: number;
  suffix?: string;
  visible?: boolean;
};

function AnimatedNumber({ end, duration = 2000, suffix = "", visible = false }: AnimatedCountProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) {
        startTimestamp = timestamp;
      }

      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = progress * (2 - progress);
      setCount(Math.floor(easeOut * end));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [visible, end, duration]);

  // visible 전(SSR 포함)에는 최종값을 표시해 검색엔진·느린 네트워크 환경에서도 실제 숫자가 보임
  return <span>{visible ? count : end}{suffix}</span>;
}

function AnimatedDecimal({ end, duration = 2000, suffix = "", visible = false }: AnimatedCountProps) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) {
      return;
    }

    let startTimestamp: number | null = null;

    const step = (timestamp: number) => {
      if (!startTimestamp) {
        startTimestamp = timestamp;
      }

      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = progress * (2 - progress);
      setCount(Number((easeOut * end).toFixed(1)));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [visible, end, duration]);

  // visible 전(SSR 포함)에는 최종값을 표시해 검색엔진·느린 네트워크 환경에서도 실제 숫자가 보임
  return <span>{visible ? count.toFixed(1) : end.toFixed(1)}{suffix}</span>;
}

export function StatsSection() {
  const [statsVisible, setStatsVisible] = useState(false);
  const statsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setStatsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.3, rootMargin: "0px 0px -100px 0px" }
    );

    if (statsRef.current) {
      observer.observe(statsRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <section className="py-32 px-4 max-w-7xl mx-auto w-full" ref={statsRef}>
      <div className="flex flex-col items-center text-center mb-16">
        <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
          HRA 성과
        </h2>
        <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-4 mb-4" />
      </div>

      <div className="flex flex-wrap justify-center items-start">
        <div className="flex items-start w-1/2 md:w-auto">
          <div className="flex flex-col items-center px-4 md:px-12 py-8 w-full text-center">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedNumber end={19} suffix="년" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">운영 기간</div>
          </div>
          <div className="hidden md:block w-px h-16 bg-[#D9D9D9] mt-10" />
        </div>

        <div className="flex items-start w-1/2 md:w-auto">
          <div className="flex flex-col items-center px-4 md:px-12 py-8 w-full text-center">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedDecimal end={75.5} suffix="%" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">취업률</div>
          </div>
          <div className="hidden md:block w-px h-16 bg-[#D9D9D9] mt-10" />
        </div>

        <div className="flex items-start w-1/2 md:w-auto">
          <div className="flex flex-col items-center px-4 md:px-12 py-8 w-full text-center">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedNumber end={406} suffix="명" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">누적 수료생</div>
            <div className="text-sm text-[#999999] mt-1">조기 수료 포함</div>
          </div>
          <div className="hidden md:block w-px h-16 bg-[#D9D9D9] mt-10" />
        </div>

        <div className="flex items-start w-1/2 md:w-auto">
          <div className="flex flex-col items-center px-4 md:px-12 py-8 w-full text-center">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedNumber end={90} suffix="%" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">수료생 만족도</div>
            <div className="text-sm text-[#999999] mt-1">최근 3개년 간 수료생 만족도</div>
          </div>
        </div>
      </div>
    </section>
  );
}
