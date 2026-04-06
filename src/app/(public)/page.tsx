"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Target, Briefcase, Heart } from "lucide-react";

const fullHeadingText = "정답보다 중요한 것,\nHRA는 본질을 묻는 법을 배웁니다.";

const alumniData = [
  {
    id: "alumni-17",
    image: "/images/alumni-1.jpg",
    cohort: "17기 수료생",
    quote: "한계까지 도전하고, 성장으로 보답하다"
  },
  {
    id: "alumni-18",
    image: "/images/alumni-2.jpg",
    cohort: "18기 수료생",
    quote: "본질을 묻는 힘, 현업에서의 차이를 만들다"
  },
  {
    id: "alumni-19",
    image: "/images/alumni-3.jpg",
    cohort: "19기 수료생",
    quote: "평생을 함께할 최고의 동료들을 얻었습니다"
  }
];

const AnimatedNumber = ({ end, duration = 2000, suffix = "", visible = false }: { end: number, duration?: number, suffix?: string, visible?: boolean }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) return;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = progress * (2 - progress);
      setCount(Math.floor(easeOut * end));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [visible, end, duration]);

  return <span>{count}{suffix}</span>;
};

const AnimatedDecimal = ({ end, duration = 2000, suffix = "", visible = false }: { end: number, duration?: number, suffix?: string, visible?: boolean }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!visible) return;

    let startTimestamp: number | null = null;
    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      const easeOut = progress * (2 - progress);
      setCount(Number((easeOut * end).toFixed(1)));

      if (progress < 1) {
        window.requestAnimationFrame(step);
      }
    };

    window.requestAnimationFrame(step);
  }, [visible, end, duration]);

  return <span>{count.toFixed(1)}{suffix}</span>;
};

export default function Home() {
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
            {parts[1].split("본질").map((chunk, i, arr) => (
              <React.Fragment key={`chunk-${i}-${chunk}`}>
                {chunk}
                {i < arr.length - 1 && (
                  <span className="text-blue-600 underline decoration-blue-600/30 underline-offset-4">본질</span>
                )}
              </React.Fragment>
            ))}
          </>
        )}
      </>
    );
  };

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
      { threshold: 0.1 }
    );

    if (statsRef.current) {
      observer.observe(statsRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % alumniData.length);
  }, []);

  const prevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + alumniData.length) % alumniData.length);
  }, []);

  return (
    <div className="flex flex-col min-h-screen bg-[#FFFFFF] text-[#1a1a1a] font-sans selection:bg-blue-100 selection:text-blue-900">
      
      <section className="relative flex flex-col items-center justify-center min-h-[90vh] px-4 overflow-hidden text-center bg-gray-900">
        <div 
          className="absolute inset-0 z-0 bg-cover bg-center"
          style={{ backgroundImage: "url('/images/hero-bg.jpg')" }}
        />
        <div className="absolute inset-0 z-0 bg-black/50" />

        <div className="relative z-10 flex flex-col items-center max-w-5xl gap-6">
          <h2 className="text-sm font-semibold tracking-widest text-white/80 uppercase">
            Human Renaissance Academy
          </h2>
          
          <h1 
            className={`font-extrabold tracking-tight text-white transition-all duration-1000 whitespace-pre-line leading-[1.1]
              ${isTypingComplete
                ? "text-[42px] md:text-[56px] lg:text-[66px]"
                : "text-[50px] md:text-[66px] lg:text-[80px]"}
            `}
          >
            {renderHeading()}
          </h1>
          
          <p className="max-w-2xl text-[18px] text-white/90 font-light tracking-wide px-2 leading-relaxed mt-4">
            고전 읽기와 토의·토론, 케이스 스터디를 통해<br className="hidden sm:block" />
            사고력을 비약적으로 성장하게 하는 1년 과정의 아카데미입니다.
          </p>
          
          <div className="mt-10 flex flex-col items-center gap-6">
            <Link href="/recruitment">
              <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white hover:text-[#1a1a1a] font-semibold h-14 px-10 text-lg rounded-lg border-2 transition-all duration-300">
                모집 안내 보기
              </Button>
            </Link>
            <Link 
              href="https://docs.google.com/forms/d/e/1FAlpQLSdWsLi_3umEuLWQXg0OuSq5LTETmcolXy1l3auTohWY1ZTxiww/viewform" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white underline underline-offset-4 text-sm font-medium transition-colors"
            >
              지원하기
            </Link>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 max-w-7xl mx-auto w-full">
        <div className="flex flex-col items-center text-center mb-16">
          <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
            HRA가 지향하는 교육
          </h2>
          <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-[25px] mb-[5px]" />
          <p className="text-lg text-[#666666] mt-0 font-medium">
            깊이 사고하고 넓게 실천하는 교육
          </p>
          <p className="text-lg leading-8 text-[#666666] max-w-3xl mt-4">
            단순한 지식 전달을 넘어, 근본적인 질문을 던지고 스스로 해답을 찾아가는 과정을 경험합니다. 다양한 분야의 인재들이 모여 서로의 시각을 나누고 성장하는 배움의 장을 제공합니다.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:h-[500px] auto-rows-[minmax(280px,auto)] md:auto-rows-auto">
          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] shadow-[var(--shadow-soft)]">
            <div 
              className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-105"
              style={{ backgroundImage: "url('/images/classical.jpg')" }}
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-500 group-hover:bg-black/60" />
            
            <div className="absolute inset-0 p-8 flex flex-col justify-end transition-all duration-500">
              <h3 className="text-white font-bold tracking-tight transition-all duration-500 transform group-hover:-translate-y-4 md:group-hover:text-[32px] text-[32px] md:text-[40px] leading-[1.05] mb-4">
                고전<br/>읽기
              </h3>
              <div className="mt-4 md:mt-0 md:h-0 md:opacity-0 overflow-hidden transition-all duration-500 md:group-hover:h-auto md:group-hover:opacity-100 md:group-hover:mt-4">
                <p className="text-white/90 text-lg leading-8 font-medium border-t border-white/30 pt-4">
                  시대를 초월한 지혜를 담은 고전을 통해, 인간과 사회의 본질을 깊이 있게 탐구합니다.
                </p>
              </div>
            </div>
          </div>

          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] shadow-[var(--shadow-soft)]">
            <div 
              className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-105"
              style={{ backgroundImage: "url('/images/casestudy.jpg')" }}
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-500 group-hover:bg-black/60" />
            
            <div className="absolute inset-0 p-8 flex flex-col justify-end transition-all duration-500">
              <h3 className="text-white font-bold tracking-tight transition-all duration-500 transform group-hover:-translate-y-4 md:group-hover:text-[32px] text-[32px] md:text-[40px] leading-[1.05] mb-4">
                케이스<br/>스터디
              </h3>
              <div className="mt-4 md:mt-0 md:h-0 md:opacity-0 overflow-hidden transition-all duration-500 md:group-hover:h-auto md:group-hover:opacity-100 md:group-hover:mt-4">
                <p className="text-white/90 text-lg leading-8 font-medium border-t border-white/30 pt-4">
                  실제 비즈니스 현장의 생생한 사례를 분석하며 문제 해결 능력과 전략적 사고를 기릅니다.
                </p>
              </div>
            </div>
          </div>

          <div className="group relative rounded-2xl overflow-hidden border border-[#D9D9D9] shadow-[var(--shadow-soft)]">
            <div 
              className="absolute inset-0 bg-cover bg-center transition-all duration-700 group-hover:scale-105"
              style={{ backgroundImage: "url('/images/lecture.jpg')" }}
            />
            <div className="absolute inset-0 bg-black/20 transition-colors duration-500 group-hover:bg-black/60" />
            
            <div className="absolute inset-0 p-8 flex flex-col justify-end transition-all duration-500">
              <h3 className="text-white font-bold tracking-tight transition-all duration-500 transform group-hover:-translate-y-4 md:group-hover:text-[32px] text-[32px] md:text-[40px] leading-[1.05] mb-4">
                특강
              </h3>
              <div className="mt-4 md:mt-0 md:h-0 md:opacity-0 overflow-hidden transition-all duration-500 md:group-hover:h-auto md:group-hover:opacity-100 md:group-hover:mt-4">
                <p className="text-white/90 text-lg leading-8 font-medium border-t border-white/30 pt-4">
                  각 분야 최고의 전문가들을 모시고 현장의 인사이트와 깊이 있는 지식을 배웁니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 max-w-7xl mx-auto w-full border-t border-[#D9D9D9]">
        <div className="max-w-7xl mx-auto w-full">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
              HRA 핵심 가치
            </h2>
            <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-[25px] mb-[5px]" />
            <p className="text-lg text-[#666666] mt-0 font-medium">
              3C 인재를 향한 세 가지 핵심 가치
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="group relative bg-[#FFFFFF] border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden p-10 transition-all duration-500 h-[380px] flex flex-col">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-600 to-blue-800 -translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-in-out z-0" />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-8 group-hover:bg-white/20 transition-colors duration-500">
                  <Target className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors duration-500" />
                </div>
                
                <h3 className="text-[24px] font-bold text-[#1a1a1a] group-hover:text-white transition-colors duration-500 mb-1">
                  사명감
                </h3>
                <h4 className="text-[18px] font-medium text-blue-600 group-hover:text-blue-200 transition-colors duration-500 mb-6">
                  Commitment
                </h4>
                
                <p className="text-lg leading-8 text-[#666666] group-hover:text-white transition-colors duration-500 mt-auto">
                  나를 넘어 사회를 향하는 마음. 주어진 일에 책임감을 가지고 끝까지 완수해내는 태도를 기릅니다.
                </p>
              </div>
            </div>

            <div className="group relative bg-[#FFFFFF] border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden p-10 transition-all duration-500 h-[380px] flex flex-col">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-600 to-blue-800 -translate-y-full group-hover:translate-y-0 transition-transform duration-700 ease-in-out z-0" />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-8 group-hover:bg-white/20 transition-colors duration-500">
                  <Briefcase className="w-8 h-8 text-blue-600 group-hover:text-white transition-colors duration-500" />
                </div>
                
                <h3 className="text-[24px] font-bold text-[#1a1a1a] group-hover:text-white transition-colors duration-500 mb-1">
                  업무능력
                </h3>
                <h4 className="text-[18px] font-medium text-blue-600 group-hover:text-blue-200 transition-colors duration-500 mb-6">
                  Competence
                </h4>
                
                <p className="text-lg leading-8 text-[#666666] group-hover:text-white transition-colors duration-500 mt-auto">
                  배움을 실천으로 이어가는 힘. 비판적 사고와 탁월한 문제 해결 능력으로 현장에서 가치를 창출합니다.
                </p>
              </div>
            </div>

            <div className="group relative bg-[#FFFFFF] border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden p-10 transition-all duration-500 h-[380px] flex flex-col">
              <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-blue-600 to-blue-800 transition-transform duration-700 ease-in-out z-0" />
              
              <div className="relative z-10 flex flex-col h-full">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center mb-8 transition-colors duration-500">
                  <Heart className="w-8 h-8 text-white transition-colors duration-500" />
                </div>
                
                <h3 className="text-[24px] font-bold text-white transition-colors duration-500 mb-1">
                  성품
                </h3>
                <h4 className="text-[18px] font-medium text-blue-200 transition-colors duration-500 mb-6">
                  Character
                </h4>
                
                <p className="text-lg leading-8 text-white transition-colors duration-500 mt-auto">
                  생각의 깊이와 마음의 넓이를 기르는 자세. 타인을 존중하고 공동체와 함께 성장하는 바른 인성을 갖춥니다.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 max-w-7xl mx-auto w-full border-t border-[#D9D9D9]" ref={statsRef}>
        <div className="flex flex-col items-center text-center mb-16">
          <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
            HRA 성과
          </h2>
          <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-[25px] mb-[5px]" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[#D9D9D9] bg-[#D9D9D9]">
          <div className="flex flex-col items-center justify-center bg-white px-4 py-8 md:py-10">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedNumber end={19} suffix="년" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">운영 기간</div>
          </div>
          
          <div className="flex flex-col items-center justify-center bg-white px-4 py-8 md:py-10">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedDecimal end={75.5} suffix="%" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">취업률</div>
          </div>
          
          <div className="flex flex-col items-center justify-center bg-white px-4 py-8 md:py-10">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedNumber end={406} suffix="명" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">누적 수료생</div>
          </div>
          
          <div className="flex flex-col items-center justify-center bg-white px-4 py-8 md:py-10">
            <div className="text-[40px] md:text-[50px] font-bold text-[#1a1a1a] mb-2 tracking-tighter">
              <AnimatedNumber end={90} suffix="%" visible={statsVisible} />
            </div>
            <div className="text-lg text-[#666666]">수료생 만족도</div>
          </div>
        </div>
      </section>

      <section className="py-24 px-4 bg-[var(--surface-subtle)] border-t border-[#D9D9D9]">
        <div className="flex flex-col items-center text-center mb-16 mx-auto max-w-3xl">
          <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
            당신의 다음 성장을 HRA에서 시작해보세요
          </h2>
          <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-[25px] mb-[5px]" />
          <p className="text-lg text-[#666666] mt-0 mb-12">
            최고의 동료들과 함께 압도적인 성장을 경험할 준비가 되셨나요?
          </p>
          
          <Link href="/recruitment">
            <Button size="lg" className="bg-[var(--brand)] hover:bg-blue-700 text-white font-semibold h-14 px-10 text-lg rounded-lg transition-all duration-300">
              모집 안내 보기
            </Button>
          </Link>
        </div>
      </section>

      <section className="py-24 px-4 max-w-7xl mx-auto w-full border-t border-[#D9D9D9]">
        <div className="flex flex-col items-center text-center mb-16">
          <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
            수료생 이야기
          </h2>
          <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-[25px] mb-[5px]" />
        </div>

        <div className="relative border border-[#D9D9D9] shadow-[var(--shadow-soft)] rounded-2xl overflow-hidden bg-white">
          <div className="flex transition-transform duration-700 ease-in-out h-auto md:h-[500px]" style={{ transform: `translateX(-${currentSlide * 100}%)` }}>
            {alumniData.map((alumni) => (
              <div key={alumni.id} className="min-w-full relative h-full flex flex-col md:flex-row">
                <div 
                  className="w-full md:w-1/2 h-64 md:h-full bg-cover bg-center border-r border-[#D9D9D9]"
                  style={{ backgroundImage: `url('${alumni.image}')` }}
                >
                  <div className="w-full h-full bg-black/20" />
                </div>
                
                <div className="w-full md:w-1/2 p-6 md:p-16 flex flex-col justify-center bg-white relative">
                  <div className="inline-block px-4 py-1.5 bg-gray-100 text-gray-800 font-semibold text-lg rounded-full mb-6 w-max">
                    {alumni.cohort}
                  </div>
                  
                  <h3 className="text-2xl md:text-4xl font-bold text-[#1a1a1a] leading-snug mb-8">
                    &quot;{alumni.quote}&quot;
                  </h3>
                  
                  <Link href="#" className="text-[var(--brand)] font-semibold flex items-center hover:underline transition-colors mt-auto md:mt-0 w-max text-lg">
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

    </div>
  );
}
