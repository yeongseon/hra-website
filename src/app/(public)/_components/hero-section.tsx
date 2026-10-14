/**
 * 홈페이지 첫 화면의 히어로 섹션을 담당하는 클라이언트 컴포넌트입니다.
 * 타이핑 애니메이션과 완료 시점에 따른 제목 크기 전환처럼 브라우저 상태가 필요한 표현만 이 파일에서 처리합니다.
 */

"use client";

import { Fragment, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

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
                  // 다크 오버레이 위에서 색상만으로 강조.
                  // 주변 텍스트가 흰색이 되므로 blue-400(#60a5fa)으로 상향.
                  // blue-600(#2563EB)은 흰색 대비 밝기 차이가 작아 hue 포인트가 약해짐.
                  // blue-400은 채도가 충분해 흰 텍스트 사이에서 hue 차이로 시선을 분리하면서
                  // 다크 오버레이 위에서도 선명하게 유지됨 (WCAG AA ✓).
                  <span className="text-blue-400">본질</span>
                )}
              </Fragment>
            ))}
          </>
        )}
      </>
    );
  };

  return (
    // min-h-[90svh] (모바일) / min-h-[90vh] (md 이상)
    //   모바일 브라우저는 스크롤에 따라 주소창이 접혔다 펴지면서 1vh 의 실제 높이가 계속 바뀐다.
    //   그 결과 90vh 로 잡으면 히어로 높이가 스크롤 도중 출렁인다.
    //   svh(small viewport height) 는 "주소창이 펼쳐진 상태" 기준으로 고정되므로 흔들림이 없다.
    //   데스크톱은 주소창 변화가 없으므로 기존 vh 를 그대로 유지한다.
    <section className="relative flex flex-col items-center justify-center min-h-[90svh] md:min-h-[90vh] px-4 overflow-hidden text-center bg-gray-900">
      <Image src="/images/hero-bg.jpeg" alt="HRA 수업 현장" fill className="object-cover z-0" priority />
      <div className="absolute inset-0 z-0 bg-black/60" />

      <div className="relative z-10 flex flex-col items-center text-center max-w-5xl gap-6 w-full mx-auto">
        <h2 className="text-sm font-semibold tracking-widest text-white/80 uppercase">
          HUMAN RENAISSANCE ACADEMY
        </h2>

        {/*
          제목 크기 — 모바일 기준값을 42px → 30px 으로 낮췄다.
          "HRA는 본질을 묻는 법을 배웁니다." 는 18자이고, 42px 한글은 글자당 약 42px 을 차지한다.
          390px 폭(iPhone 기준, 좌우 px-4 제외 시 358px)에서는 한 줄에 8자 남짓만 들어가
          제목 한 문장이 3줄로 쪼개지고 화면 대부분을 제목이 차지해 버린다.
          30px 로 낮추면 한 줄에 11자가 들어가 2줄로 정리된다.
        */}
        <h1
          className={`font-extrabold tracking-tight text-white transition-all duration-1000 whitespace-pre-line leading-[1.15] sm:leading-[1.1]
            ${isTypingComplete ? "text-[30px] sm:text-[42px] md:text-[56px] lg:text-[66px]" : "text-[30px] sm:text-[42px] md:text-[66px] lg:text-[80px]"}
          `}
        >
          {/* 서버 HTML과 스크린 리더에는 제목 전체를 제공하고, 타이핑 표현만 시각적으로 표시합니다. */}
          <span className="sr-only">{fullHeadingText}</span>
          <span aria-hidden="true">{renderHeading()}</span>
        </h1>

        {/*
          whitespace-nowrap 을 sm(640px) → lg(1024px) 으로 늦췄다.
          이 문장은 18px 기준 실제 너비가 약 700px 이라, 640~1023px 구간에서 nowrap 을 걸면
          부모 section 의 overflow-hidden 에 걸려 문장 양끝이 잘려 보였다.
          한 줄로 붙이는 연출은 실제로 한 줄이 들어가는 lg 이상에서만 적용한다.
        */}
        <p className="max-w-4xl text-[16px] sm:text-[18px] text-white/75 font-light tracking-wide leading-relaxed mt-4 lg:whitespace-nowrap">
          고전 읽기와 토론, 케이스 스터디를 통해 사고력과 실천력을 기르는 1년 과정입니다.
        </p>

        <Link href="/recruitment" className="inline-flex items-center rounded-full bg-[#2563EB] px-8 py-3 text-base font-semibold text-white transition-colors hover:bg-blue-700 mt-6">
          모집안내 보기
        </Link>
      </div>
    </section>
  );
}
