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
import { BookOpen, Briefcase, FileSearch, Mic, HeartHandshake } from "lucide-react";

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
    title: "봉사활동",
    icon: HeartHandshake,
    description: "HRA는 일정 시간 이상의 봉사활동을 통해 사회적 책임과 공동체 의식을 함양하는 것을 중요하게 생각합니다. 참가자들은 다양한 봉사활동에 참여하며 타인과 사회에 대한 이해를 넓히고, 성숙한 시민으로서의 태도를 기르게 됩니다.",
  },
];

// 같은 설명을 공유하는 월들을 pill 로 묶기 위한 그룹 정의
const timelineGroups = [
  {
    category: "전반기",
    months: [
      { label: "9월", value: "9월" },
      { label: "10월", value: "10월" },
      { label: "11월", value: "11월" },
      { label: "12월", value: "12월" },
    ],
  },
  {
    category: "겨울캠프",
    months: [
      { label: "1월", value: "1월" },
      { label: "2월", value: "2월" },
    ],
  },
  {
    category: "후반기",
    months: [
      { label: "3월", value: "3월" },
      { label: "4월", value: "4월" },
      { label: "5월", value: "5월" },
      { label: "6월", value: "6월" },
    ],
  },
  {
    category: "인턴",
    months: [
      { label: "7월", value: "7월" },
      { label: "8월", value: "8월" },
    ],
  },
  {
    category: "수료식/입학식",
    months: [{ label: "9월", value: "9월-end" }],
  },
];

// 월 값 → 카테고리 매핑
const getTimelineCategory = (monthValue: string) => {
  if (["9월", "10월", "11월", "12월"].includes(monthValue)) return "전반기";
  if (["1월", "2월"].includes(monthValue)) return "겨울캠프";
  if (["3월", "4월", "5월", "6월"].includes(monthValue)) return "후반기";
  if (["7월", "8월"].includes(monthValue)) return "인턴";
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
    description: "1월 7박 8일간 진행되는 겨울캠프에서는 합숙과 집중 학습, 토론, 협업을 통해 사고력과 문제 해결 능력, 자기주도성을 강화합니다. 2월에는 캠프 경험을 회고하며 배움을 정리하고 하반기 활동을 준비합니다.",
  },
  "후반기": {
    title: "후반기 (3월~6월)",
    description: "3월부터 6월까지 이어지는 후반기는 전반기와 겨울캠프의 역량을 실전 과제와 협업 프로젝트로 전환하는 시기입니다. 배움을 삶과 커리어로 연결하는 경험을 쌓아갑니다.",
  },
  "인턴": {
    title: "인턴 (7월~8월)",
    description: "7월 인턴 준비 과정을 거쳐 8월에는 기업 및 기관에서 현장 실습을 진행하며 배운 내용을 실제 업무 환경에서 경험합니다. 이를 통해 이론과 실무를 연결하고, 자신의 진로 방향을 보다 구체적으로 설계할 수 있습니다.",
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
  // 각 그룹 컨테이너 ref 배열 — index 는 timelineGroups 순서와 일치
  const groupRefs = useRef<(HTMLDivElement | null)[]>([]);
  // ResizeObserver 콜백 안에서 최신 displayMonth 를 읽기 위한 ref (stale closure 방지)
  const displayMonthRef = useRef<string | null>(null);
  
  // 표시 우선순위: hover > tap > null(숨김)
  const displayMonth = hoveredMonth ?? tappedMonth;

  useEffect(() => {
    displayMonthRef.current = displayMonth;
  }, [displayMonth]);

  const monthCategory = displayMonth ? getTimelineCategory(displayMonth) : null;
  const groupInfo = monthCategory ? timelineGroupInfo[monthCategory] : null;

  // 렌더링 도중 lastGroupInfo 업데이트 (파생 상태 활용)
  const [lastGroupInfo, setLastGroupInfo] = useState(groupInfo);
  const [prevGroupInfo, setPrevGroupInfo] = useState(groupInfo);
  if (groupInfo !== prevGroupInfo) {
    setPrevGroupInfo(groupInfo);
    setLastGroupInfo(groupInfo);
  }

  const isVisible = displayMonth !== null;

  /**
   * updateAnchor: 그룹 index 를 받아 anchorX / containerWidth 를 갱신.
   *
   * 핵심: containerRef(band inner div)의 getBoundingClientRect() 는 padding 을 포함한 outer 너비를 반환한다.
   * 반면 카드의 margin-left 는 페이지 outer 컨테이너의 content area(padding 제외) 기준이다.
   * 두 좌표계를 일치시키기 위해 getComputedStyle 로 padding 을 실측하고 content area 기준으로 환산한다.
   *
   * - contentLeft  = cRect.left + paddingLeft  → content area 왼쪽 끝의 screen 좌표
   * - contentWidth = cRect.width - padL - padR → 실제 사용 가능 너비 (카드 margin-left 의 기준)
   * - anchorX      = 그룹 중앙 X - contentLeft  → content area 기준 버튼 위치
   */
  const updateAnchor = useCallback((idx: number) => {
    const groupEl = groupRefs.current[idx];
    const container = containerRef.current;
    if (!groupEl || !container) return;
    const gRect = groupEl.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    // 반응형 padding 실측 (px-4=16px / sm:px-6=24px)
    const style = getComputedStyle(container);
    const padL = parseFloat(style.paddingLeft);
    const padR = parseFloat(style.paddingRight);
    // content area 왼쪽 끝 기준으로 그룹 중앙 X 계산
    setAnchorX(gRect.left - (cRect.left + padL) + gRect.width / 2);
    // content area 너비 = 카드 margin-left 의 기준 너비
    setContainerWidth(cRect.width - padL - padR);
  }, []);

  /**
   * ResizeObserver: 창 크기가 바뀔 때마다 content area 너비를 재측정하고
   * 현재 displayMonth 가 있으면 anchorX 도 재계산한다.
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
        const groupIdx = timelineGroups.findIndex((g) => g.months.some((m) => m.value === dm));
        if (groupIdx >= 0) updateAnchor(groupIdx);
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
        <section className="mb-56 sm:mb-64">
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
                {/* 그룹별 pill 로 묶인 타임라인 — pill 사이 선 없음, pill 내부 달끼리 선 연결 */}
                <div className="flex w-full items-center gap-1 sm:gap-2">
                  {timelineGroups.map((group, groupIdx) => {
                    const isGroupActive = monthCategory === group.category;
                    return (
                      <div
                        key={group.category}
                        ref={(el) => {
                          groupRefs.current[groupIdx] = el;
                        }}
                        onMouseEnter={() => {
                          setHoveredMonth(group.months[0].value);
                          updateAnchor(groupIdx);
                        }}
                        onMouseLeave={() => setHoveredMonth(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          updateAnchor(groupIdx);
                          setTappedMonth((prev) =>
                            prev === group.months[0].value ? null : group.months[0].value
                          );
                        }}
                        className={`flex items-center rounded-full border transition-all duration-300 py-5 px-3 cursor-pointer ${
                          isGroupActive
                            ? "bg-white border-white shadow-md scale-[1.02]"
                            : "bg-[#2563EB] border-white/40 hover:bg-[#1D4ED8]"
                        }`}
                        style={{ flex: group.months.length }}
                      >
                        {group.months.flatMap((month, monthIdx) => {
                          const items = [];
                          if (monthIdx > 0) {
                            items.push(
                              <div
                                key={`line-${month.value}`}
                                className={`w-6 sm:w-10 h-px shrink-0 transition-colors duration-300 ${
                                  isGroupActive ? "bg-[#2563EB]/30" : "bg-white/30"
                                }`}
                              />
                            );
                          }
                          items.push(
                            <div
                              key={month.value}
                              className="flex-1 flex justify-center"
                            >
                              <button
                                type="button"
                                tabIndex={-1}
                                aria-pressed={isGroupActive}
                                aria-label={`${month.label} 커리큘럼 상세 보기`}
                                className={`transition-all duration-300 text-xs sm:text-sm focus:outline-none select-none leading-none pointer-events-none ${
                                  isGroupActive
                                    ? "font-bold text-[#2563EB] scale-125"
                                    : "font-medium text-white/60"
                                }`}
                              >
                                {month.label}
                              </button>
                            </div>
                          );
                          return items;
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/*
                팝업 카드 — absolute 로 띠지 바로 아래에 오버레이.
                document flow 에서 분리되므로 아래 7개 카드가 밀리지 않는다.
              */}
              <div
                aria-live="polite"
                onClick={(e) => e.stopPropagation()}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  opacity: isVisible ? 1 : 0,
                  pointerEvents: isVisible ? "auto" : "none",
                  transition: "opacity 250ms ease-out",
                }}
              >
                <div className="mx-auto max-w-7xl px-4 sm:px-6">
                  <div className="pt-8 pb-5">
                    <div
                      className="relative rounded-2xl bg-white border border-[#D9D9D9] p-6 sm:p-8 shadow-lg"
                      style={{
                        width: cardW > 0 ? `${cardW}px` : "100%",
                        marginLeft: `${cardLeft}px`,
                        transition: "margin-left 150ms ease-out",
                      }}
                    >
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

                      {/* lastGroupInfo: fade-out 중에도 이전 텍스트 유지 */}
                      <h3 className="mb-3 text-xl sm:text-2xl font-bold text-[#1a1a1a]">
                        {lastGroupInfo?.title}
                      </h3>
                      <p className="text-sm sm:text-base text-[#475569] leading-relaxed">
                        {lastGroupInfo?.description}
                      </p>
                    </div>
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
