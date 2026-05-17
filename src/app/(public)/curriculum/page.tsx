"use client";

/**
 * 커리큘럼 페이지
 * - 52주 여정 타임라인: hover/tap한 월 버튼 위치 기준으로 카드가 동적으로 이동하는 floating 팝업
 *   - containerRef(타임라인 내부 max-w-7xl 컨테이너)와 buttonRefs 로 버튼 중앙 X 좌표 측정
 *   - anchorX 기준으로 카드 margin-left + 삼각형 left 를 계산
 *   - 카드가 viewport 밖으로 나가지 않도록 clamp 처리
 *   - ResizeObserver 로 창 크기 변경 시 재계산
 * - 커리큘럼 항목 카드 그리드
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { BookOpen, Briefcase, FileSearch, Mic, Building, HeartHandshake, Tent } from "lucide-react";

/**
 * CSS max-w-2xl(672px)과 동기화된 카드 최대 너비.
 * clamp 계산에만 사용하며, 실제 렌더 너비는 CSS가 결정한다.
 */
const CARD_MAX_W = 672;

// 커리큘럼 항목 데이터 (카드 섹션)
const curriculumItems = [
  {
    title: "고전 읽기",
    icon: BookOpen,
    description: "HRA의 고전 읽기 과정은 국내외 대학에서 권장하는 고전을 바탕으로 진행됩니다. 참가자들은 독서 후 발표와 토론을 통해 내용을 깊이 이해하며, 사고력과 글쓰기·발표 역량을 함께 키워나갑니다.",
  },
  {
    title: "경영서",
    icon: Briefcase,
    description: "경영서 학습은 기업과 조직, 시장의 구조를 이해하기 위한 과정입니다. 참가자들은 다양한 경영 도서를 바탕으로 내용을 분석하고 토론하며, 실무적 시각과 통합적인 사고력을 키워나갑니다.",
  },
  {
    title: "케이스스터디",
    icon: FileSearch,
    description: "케이스스터디는 실제 기업 및 사회 사례를 바탕으로 문제를 분석하고 해결 방안을 도출하는 과정입니다. 참가자들은 팀 토론과 발표를 통해 논리적 사고력과 설득력 있는 의사소통 능력, 실무 중심의 문제 해결 역량을 키워나갑니다.",
  },
  {
    title: "특강",
    icon: Mic,
    description: "HRA에서는 다양한 분야의 전문가를 초청해 특강을 진행합니다. 스피치와 영어 세션, 취업 특강 등을 통해 표현력과 커뮤니케이션 능력, 진로 및 취업 역량을 균형 있게 키워나갈 수 있습니다.",
  },
  {
    title: "하계 인턴",
    icon: Building,
    description: "하계 인턴 과정은 학습한 내용을 실제 현장에서 경험해볼 수 있는 과정입니다. 참가자들은 기업 및 기관에서의 실무 경험을 통해 업무 환경을 이해하고, 이론과 실무를 연결하며 진로 방향을 구체화할 수 있습니다.",
  },
  {
    title: "봉사활동",
    icon: HeartHandshake,
    description: "HRA는 일정 시간 이상의 봉사활동을 통해 사회적 책임과 공동체 의식을 함양하는 것을 중요하게 생각합니다. 참가자들은 다양한 봉사활동에 참여하며 타인과 사회에 대한 이해를 넓히고, 성숙한 시민으로서의 태도를 기르게 됩니다.",
  },
  {
    title: "겨울캠프",
    icon: Tent,
    description: "겨울캠프는 일정 기간 합숙하며 집중적으로 학습과 토론을 진행하는 프로그램입니다. 참가자들은 교육에 몰입하며 사고력과 문제 해결 능력을 키우고, 한 단계 더 성장하는 경험을 하게 됩니다.",
  },
];

// 타임라인 월 목록 (Sep.~Aug. + 수료식 Sep.)
const timelineMonths = [
  { label: "Sep.", value: "sep" },
  { label: "Oct.", value: "oct" },
  { label: "Nov.", value: "nov" },
  { label: "Dec.", value: "dec" },
  { label: "Jan.", value: "jan" },
  { label: "Feb.", value: "feb" },
  { label: "Mar.", value: "mar" },
  { label: "Apr.", value: "apr" },
  { label: "May.", value: "may" },
  { label: "Jun.", value: "jun" },
  { label: "Jul.", value: "jul" },
  { label: "Aug.", value: "aug" },
  { label: "Sep.", value: "sep-end" },
];

// 월 값 → 카테고리 매핑
const getTimelineCategory = (monthValue: string) => {
  if (["sep", "oct", "nov", "dec"].includes(monthValue)) return "전반기";
  if (["jan", "feb"].includes(monthValue)) return "겨울캠프";
  if (["mar", "apr", "may", "jun"].includes(monthValue)) return "후반기";
  if (["jul", "aug"].includes(monthValue)) return "인턴";
  return "수료식/입학식";
};

// 카테고리별 팝업 내용
const timelineGroupInfo: Record<string, { title: string; description: string }> = {
  "전반기": {
    title: "전반기 (9월~12월)",
    description: "9월 입학식부터 12월까지 이어지는 전반기 15주 과정입니다. 고전 읽기, 경영서, 케이스스터디를 통해 참가자들의 사고력과 표현력, 문제 해결 능력을 단단히 기초를 다져갑니다.",
  },
  "겨울캠프": {
    title: "겨울캠프 (1월~2월)",
    description: "1월 7박 8일의 집중 캠프에서 깊이 있는 토론과 협업을 통해 사고력, 자기 주도성, 공동체성을 강화합니다. 2월에는 캠프 경험을 회고하며 하반기를 준비합니다.",
  },
  "후반기": {
    title: "후반기 (3월~6월)",
    description: "3월부터 6월까지 이어지는 후반기는 전반기와 겨울캠프의 역량을 실전 과제와 협업 프로젝트로 전환하는 시기입니다. 배움을 삶과 커리어로 연결하는 경험을 쌓아갑니다.",
  },
  "인턴": {
    title: "인턴 (7월~8월)",
    description: "7월 인턴 준비와 8월 현장 실습을 통해 배운 내용을 실제 업무 환경에서 경험합니다. 이론과 실무를 연결하며 진로 방향을 구체화합니다.",
  },
  "수료식/입학식": {
    title: "수료식 및 입학식 (9월)",
    description: "마지막 9월에는 한 해의 성과를 돌아보는 수료식과 동시에 새로운 기수의 입학식이 진행됩니다. 참가자들은 성장을 정리하며 새로운 출발을 함께 준비합니다.",
  },
};

export default function CurriculumPage() {
  // 데스크톱 hover 상태
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  // 모바일 tap 상태 (hover 없는 터치 기기용)
  const [tappedMonth, setTappedMonth] = useState<string | null>(null);

  /**
   * anchorX: hover/tap된 버튼 중앙의 X 좌표 (containerRef 왼쪽 끝 기준 픽셀)
   * containerWidth: containerRef 의 실측 너비 (clamp 계산용)
   *
   * 두 값 모두 getBoundingClientRect() 로 측정하며, ResizeObserver 가 자동 갱신한다.
   */
  const [anchorX, setAnchorX] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);

  /**
   * containerRef: 타임라인 띠지 내부 max-w-7xl 컨테이너.
   * 이 요소와 카드 부모(페이지 outer max-w-7xl)는 동일한 너비·좌표를 가지므로
   * 여기서 측정한 anchorX 를 카드의 margin-left 에 바로 적용할 수 있다.
   */
  const containerRef = useRef<HTMLDivElement>(null);
  // 각 월 버튼 ref 배열 — index 는 timelineMonths 순서와 일치
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // ResizeObserver 콜백 안에서 최신 displayMonth 를 읽기 위한 ref (stale closure 방지)
  const displayMonthRef = useRef<string | null>(null);
  // fade-out 중에도 이전 groupInfo 텍스트가 사라지지 않도록 유지하는 ref
  const lastGroupInfoRef = useRef<{ title: string; description: string } | null>(null);

  // 표시 우선순위: hover > tap > null(숨김)
  const displayMonth = hoveredMonth ?? tappedMonth;
  displayMonthRef.current = displayMonth; // 매 렌더마다 ref 동기화

  const monthCategory = displayMonth ? getTimelineCategory(displayMonth) : null;
  const groupInfo = monthCategory ? timelineGroupInfo[monthCategory] : null;
  if (groupInfo) lastGroupInfoRef.current = groupInfo;

  const isVisible = displayMonth !== null;

  /**
   * updateAnchor: 버튼 index 를 받아 anchorX / containerWidth 를 갱신.
   *
   * 핵심: containerRef(band inner div)의 getBoundingClientRect() 는 padding 을 포함한 outer 너비를 반환한다.
   * 반면 카드의 margin-left 는 페이지 outer 컨테이너의 content area(padding 제외) 기준이다.
   * 두 좌표계를 일치시키기 위해 getComputedStyle 로 padding 을 실측하고 content area 기준으로 환산한다.
   *
   * - contentLeft  = cRect.left + paddingLeft  → content area 왼쪽 끝의 screen 좌표
   * - contentWidth = cRect.width - padL - padR → 실제 사용 가능 너비 (카드 margin-left 의 기준)
   * - anchorX      = 버튼 중앙 X - contentLeft  → content area 기준 버튼 위치
   *
   * useCallback + 빈 deps: 마운트 이후 참조가 바뀌지 않아 ResizeObserver 에서 안전하게 사용 가능.
   */
  const updateAnchor = useCallback((idx: number) => {
    const btn = buttonRefs.current[idx];
    const container = containerRef.current;
    if (!btn || !container) return;
    const btnRect = btn.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    // 반응형 padding 실측 (px-4=16px / sm:px-6=24px)
    const style = getComputedStyle(container);
    const padL = parseFloat(style.paddingLeft);
    const padR = parseFloat(style.paddingRight);
    // content area 왼쪽 끝 기준으로 버튼 중앙 X 계산
    setAnchorX(btnRect.left - (cRect.left + padL) + btnRect.width / 2);
    // content area 너비 = 카드 margin-left 의 기준 너비
    setContainerWidth(cRect.width - padL - padR);
  }, []);

  /**
   * ResizeObserver: 창 크기가 바뀔 때마다 content area 너비를 재측정하고
   * 현재 displayMonth 가 있으면 anchorX 도 재계산한다.
   * getComputedStyle 로 padding 을 실측해 containerWidth 를 content 기준으로 유지한다.
   */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      const cRect = container.getBoundingClientRect();
      const style = getComputedStyle(container);
      const padL = parseFloat(style.paddingLeft);
      const padR = parseFloat(style.paddingRight);
      setContainerWidth(cRect.width - padL - padR);
      const dm = displayMonthRef.current;
      if (dm) {
        const idx = timelineMonths.findIndex((m) => m.value === dm);
        if (idx >= 0) updateAnchor(idx);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateAnchor]);

  /**
   * 카드 위치 계산 (containerWidth = content area 너비, padding 제외)
   *
   * cardW    : 카드 실효 너비. content area 보다 클 수 없음 (CSS max-w-2xl = CARD_MAX_W = 672px 와 동기).
   * half     : cardW 의 절반.
   *
   * SAFE_PAD : 우측 안전 마진.
   *   shadow-lg 의 수평 가시 범위 ≈ blur(15px) - spread(-3px) = 12px.
   *   getBoundingClientRect 측정 오차(소수점 반올림) · 스크롤바 너비 등 환경 편차를 흡수하는 버퍼.
   *   16px 로 설정하면 shadow 12px + 4px 여유를 확보하면서 카드 이동 폭이 시각적으로 자연스럽다.
   *
   * cardLeft : 카드의 margin-left 값.
   *   - max(0)                        : content area 왼쪽 밖으로 나가지 않음
   *   - min(containerWidth-cardW-SAFE_PAD) : 카드 오른쪽 끝 + shadow 가
   *                                         content area 오른쪽 끝을 초과하지 않음
   *
   * 좁은 화면(cardW ≈ containerWidth)에서 containerWidth-cardW-SAFE_PAD < 0 이 되면
   * max(0, ...) 으로 자동 클램핑 → 카드가 position 0 에 고정, shadow 는
   * overflow-hidden 의 negative-margin 확장(16px)이 흡수.
   */
  const SAFE_PAD = 16;
  const cardW = Math.min(CARD_MAX_W, Math.max(containerWidth, 0));
  const half = cardW / 2;
  const cardLeft =
    containerWidth > 0
      ? Math.max(0, Math.min(anchorX - half, containerWidth - cardW - SAFE_PAD))
      : 0;

  /**
   * 삼각형 위치 계산
   *
   * SAFE_PAD 로 카드가 왼쪽으로 더 이동해도 삼각형은 anchorX(버튼 중앙)를 정확히 가리켜야 한다.
   * triangleLeft = anchorX - cardLeft  → cardLeft 가 clamp 될수록 값이 커져 자동 보정됨.
   * 예) Sep-end hover: card 가 SAFE_PAD 만큼 왼쪽에 있으므로 triangleLeft = anchorX - cardLeft
   *     = anchorX - (containerWidth - cardW - SAFE_PAD) → 카드 오른쪽 영역을 가리킴 ✓
   *
   * clamp [18, cardW-18]: 삼각형이 카드 둥근 모서리(border-radius) 밖으로 나가지 않도록.
   */
  const triangleLeft = Math.max(18, Math.min(anchorX - cardLeft, cardW - 18));

  // 모바일 tap 토글: 같은 월 탭 → 닫기, 다른 월 탭 → 전환
  const handleMonthClick = (value: string, idx: number) => {
    updateAnchor(idx);
    setTappedMonth((prev) => (prev === value ? null : value));
  };

  return (
    // 최상위 div onClick: 타임라인·카드 외부 클릭 시 tap 상태 초기화 (모바일 닫기)
    <div
      className="min-h-screen bg-white text-[#1a1a1a] selection:bg-blue-100 overflow-x-hidden"
      onClick={() => setTappedMonth(null)}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">

        {/* 페이지 헤더 */}
        <section className="mb-12 sm:mb-20 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
            <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
              커리큘럼
            </h1>
          </div>
          <p className="max-w-2xl text-sm text-[#666666] md:text-base">
            HRA의 52주 교육 프로그램은 단순한 지식 전달을 넘어, 참가자들이 스스로 사고하고 문제를 해결하며 성장할 수 있도록 설계된 몰입형 여정입니다.
          </p>
        </section>

        {/* 타임라인 섹션 */}
        <section className="mb-24 sm:mb-32">
          <div>
            {/*
              파란색 타임라인 띠지
              - w-screen + left-1/2 + -translate-x-1/2: 화면 좌우 끝까지 꽉 채움
              - onClick stopPropagation: 내부 클릭이 외부 닫기 핸들러로 버블링되는 것을 차단
            */}
            <div
              className="relative w-screen left-1/2 -translate-x-1/2 bg-[#2563EB]"
              onClick={(e) => e.stopPropagation()}
            >
              {/*
                containerRef 를 이 div 에 부착.
                페이지 외부 max-w-7xl 컨테이너와 동일한 너비·좌표를 가지므로
                여기서 측정한 anchorX 를 카드 margin-left 에 직접 사용할 수 있다.
              */}
              <div
                ref={containerRef}
                className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-8"
              >
                <div className="flex flex-col gap-3">

                  {/* 월 레이블 행 */}
                  <div className="flex w-full justify-between">
                    {timelineMonths.map((month, idx) => {
                      const isHighlighted = displayMonth === month.value;
                      return (
                        <div
                          key={month.value}
                          className="flex-1 flex justify-center"
                          // 데스크톱: 마우스 진입 시 hover 상태 + anchorX 갱신
                          onMouseEnter={() => {
                            setHoveredMonth(month.value);
                            updateAnchor(idx);
                          }}
                          onMouseLeave={() => setHoveredMonth(null)}
                        >
                          <button
                            // buttonRefs 에 idx 순서로 저장
                            ref={(el) => { buttonRefs.current[idx] = el; }}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleMonthClick(month.value, idx);
                            }}
                            // 접근성: 키보드 포커스도 hover와 동일하게 처리
                            onFocus={() => {
                              setHoveredMonth(month.value);
                              updateAnchor(idx);
                            }}
                            onBlur={() => setHoveredMonth(null)}
                            aria-pressed={isHighlighted}
                            aria-label={`${month.label} 커리큘럼 상세 보기`}
                            className={`transition-all duration-200 text-xs sm:text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:rounded select-none leading-none ${
                              isHighlighted
                                ? "font-bold text-white scale-125"
                                : "font-medium text-white/60 hover:text-white/80"
                            }`}
                          >
                            {month.label}
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* 연결선 + 인디케이터 행 */}
                  <div className="relative flex w-full justify-between items-center h-2">
                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-white/30" />
                    {timelineMonths.map((month) => (
                      <div key={month.value} className="flex-1 flex justify-center relative z-10">
                        {displayMonth === month.value && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white" />
                        )}
                      </div>
                    ))}
                  </div>

                </div>
              </div>
            </div>

            {/*
              팝업 카드 애니메이션 컨테이너
              - grid-template-rows 0fr → 1fr: 높이를 부드럽게 펼침/접음 (레이아웃 공간 유지)
              - opacity 0 → 1: 페이드 처리
              - aria-live="polite": 스크린 리더에 내용 변경 알림
              - onClick stopPropagation: 카드 클릭이 외부 닫기 핸들러로 전파되는 것을 차단
            */}
            <div
              aria-live="polite"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "grid",
                gridTemplateRows: isVisible ? "1fr" : "0fr",
                opacity: isVisible ? 1 : 0,
                transition: "grid-template-rows 300ms ease-out, opacity 250ms ease-out",
              }}
            >
              {/*
                overflow-hidden: grid 0fr 애니메이션에 필수 — 없으면 접었을 때 카드가 삐져나옴.
                그러나 overflow:hidden 은 box-shadow 도 clipping 한다.

                해결: negative margin + compensating padding 기법
                  marginLeft/Right: -16px → overflow clipping 경계를 좌우 16px 확장
                  paddingLeft/Right: +16px → 콘텐츠 기준점을 원래대로 복원 (cardLeft 계산 불변)
                  paddingBottom:  20px  → shadow-lg 하단 blur(~15px offset+blur) 공간 확보

                결과:
                  - 카드 position 계산(cardLeft, anchorX)은 전혀 변경 없음
                  - clipping 경계만 16px 넓어져 shadow-lg 가 완전히 보임
                  - grid 0fr 애니메이션도 정상 동작
              */}
              <div
                className="overflow-hidden"
                style={{
                  marginLeft: "-16px",
                  marginRight: "-16px",
                  paddingLeft: "16px",
                  paddingRight: "16px",
                }}
              >
                <div className="pt-8 pb-5">
                  {/*
                    카드 본체
                    - width: cardW px — JS로 너비를 명시적으로 지정.
                        max-w-2xl(Tailwind CSS rem 단위)과 CARD_MAX_W(JS px 상수)가 불일치하면
                        clamp 계산이 실제 렌더 너비와 달라져 우측 overflow 가 발생한다.
                        CSS 클래스에 의존하지 않고 JS 값 하나로 너비와 clamp 를 동기화.
                    - marginLeft: cardLeft — hover 버튼 기준으로 계산된 카드 왼쪽 좌표
                    - 두 값 모두 containerWidth 기반으로 계산되므로 항상 일치함
                  */}
                  <div
                    className="relative rounded-2xl bg-white border border-[#D9D9D9] p-6 sm:p-8 shadow-lg"
                    style={{
                      width: cardW > 0 ? `${cardW}px` : "100%",
                      marginLeft: `${cardLeft}px`,
                      transition: "margin-left 150ms ease-out",
                    }}
                  >
                    {/*
                      삼각형 — anchorX 기준 위치로 이동
                      left: triangleLeft — 카드 왼쪽 끝에서의 픽셀 거리
                      translateX(-50%): 삼각형 중앙을 left 좌표에 정렬
                      transition left 150ms: 카드와 동일 속도로 화살표도 이동
                    */}
                    {/* 회색 테두리 삼각형 (1px 뒤) */}
                    <div
                      className="absolute -translate-x-1/2"
                      style={{
                        left: triangleLeft,
                        top: -9,
                        width: 0,
                        height: 0,
                        borderLeft: "9px solid transparent",
                        borderRight: "9px solid transparent",
                        borderBottom: "9px solid #D9D9D9",
                        transition: "left 150ms ease-out",
                      }}
                    />
                    {/* 흰색 채움 삼각형 (앞) */}
                    <div
                      className="absolute -translate-x-1/2"
                      style={{
                        left: triangleLeft,
                        top: -8,
                        width: 0,
                        height: 0,
                        borderLeft: "8px solid transparent",
                        borderRight: "8px solid transparent",
                        borderBottom: "8px solid white",
                        transition: "left 150ms ease-out",
                      }}
                    />

                    {/* lastGroupInfoRef: fade-out 중에도 이전 텍스트 유지 */}
                    <h3 className="mb-3 text-xl sm:text-2xl font-bold text-[#1a1a1a]">
                      {lastGroupInfoRef.current?.title}
                    </h3>
                    <p className="text-sm sm:text-base text-[#475569] leading-relaxed">
                      {lastGroupInfoRef.current?.description}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 커리큘럼 항목 카드 그리드 */}
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
          {curriculumItems.map((item) => (
            <div
              key={item.title}
              className="group relative flex flex-col p-8 sm:p-10 rounded-2xl bg-white border border-[#D9D9D9] shadow-[var(--shadow-soft)] hover:bg-gray-50 hover:border-blue-400 transition-all duration-500 overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 opacity-60 group-hover:opacity-100 transition-opacity duration-700" />

              <div className="mb-8 p-4 rounded-2xl bg-gray-50 w-fit border border-[#D9D9D9] group-hover:scale-110 transition-transform duration-500 relative z-10">
                <item.icon className="w-8 h-8 text-blue-600" />
              </div>

              <h3 className="text-2xl font-bold text-[#1a1a1a] mb-4 tracking-tight relative z-10">
                {item.title}
              </h3>

              <p className="text-[#666666] leading-relaxed font-light mt-auto relative z-10">
                {item.description}
              </p>
            </div>
          ))}
        </section>

      </div>
    </div>
  );
}
