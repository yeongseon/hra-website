/**
 * 홈페이지 첫 화면의 히어로 섹션을 담당하는 클라이언트 컴포넌트입니다.
 * 타이핑 애니메이션과 완료 시점에 따른 제목 크기 전환처럼 브라우저 상태가 필요한 표현만 이 파일에서 처리합니다.
 */

"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";

const fullHeadingText = "정답보다 중요한 것,\nHRA는 본질을 묻는 법을 배웁니다.";

export function HeroSection() {
  const [typedHeading, setTypedHeading] = useState("");
  const [isTypingComplete, setIsTypingComplete] = useState(false);

  useEffect(() => {
    let currentIndex = 0;
    const intervalId = setInterval(() => {
      if (currentIndex <= fullHeadingText.length) {
        setTypedHeading(fullHeadingText.slice(0, currentIndex));
        currentIndex++;
      } else {
        clearInterval(intervalId);
        setIsTypingComplete(true);
      }
    }, 70);

    return () => clearInterval(intervalId);
  }, []);

  const renderHeading = () => {
    const parts = typedHeading.split("\n");

    return (
      <>
        {parts[0]}
        {parts.length > 1 && (
          <>
            <br />
            {parts[1].split("본질").map((chunk, index, array) => (
              <Fragment key={`chunk-${index}-${chunk}`}>
                {chunk}
                {index < array.length - 1 && (
                  <span className="text-blue-600 underline decoration-blue-600/30 underline-offset-4">본질</span>
                )}
              </Fragment>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    <section className="relative flex flex-col items-center justify-center min-h-[90vh] px-4 overflow-hidden text-center bg-gray-900">
      <Image src="/images/hero-bg.jpeg" alt="HRA 수업 현장" fill className="object-cover z-0" priority />
      <div className="absolute inset-0 z-0 bg-black/50" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-5xl gap-6 w-full mx-auto">
        <h2 className="text-sm font-semibold tracking-widest text-white/80 uppercase">
          HUMAN RENAISSANCE ACADEMY
        </h2>

        <h1
          className={`font-extrabold tracking-tight text-white transition-all duration-1000 whitespace-pre-line leading-[1.1]
            ${isTypingComplete ? "text-[42px] md:text-[56px] lg:text-[66px]" : "text-[50px] md:text-[66px] lg:text-[80px]"}
          `}
        >
          {renderHeading()}
        </h1>

        <p className="max-w-4xl text-[18px] text-white/90 font-light tracking-wide leading-relaxed mt-4 sm:whitespace-nowrap">
          고전 읽기와 토론, 케이스 스터디를 통해 사고력과 실천력을 기르는 1년 과정입니다.
        </p>

        <a href="/recruitment" className="inline-flex items-center rounded-full bg-[#2563EB] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 mt-6">
          모집안내 보기
        </a>
      </div>
    </section>
  );
}
