/**
 * 메인 페이지 캘린더 클라이언트 컴포넌트
 *
 * 역할: 월별 달력 그리드 + 선택 날짜 일정 상세 패널 렌더링
 * 사용 위치: calendar-section.tsx (서버 컴포넌트)에서 호출
 *
 * 동작 방식:
 *   - 달력 그리드를 직접 구현 (7×N 셀, 이벤트 있는 날짜에 컬러 점 표시)
 *   - 날짜 클릭 시 오른쪽 패널에 세션 상세 표시
 *   - 월 이동 버튼 클릭 시 URL ?year=X&month=Y 로 라우팅 → 서버 재조회
 */

"use client";

import { useTransition } from "react";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getSerializedScheduleEvents } from "@/features/schedule/actions";

// ============================================================
// 타입 정의 (서버 컴포넌트에서 직렬화된 데이터)
// ============================================================

type SerializedSession = {
  category: "CLASSICS" | "ENGLISH" | "SPEECH" | "SPECIAL_LECTURE" | "CASE_STUDY";
  content: string | null;
  reportCategory: string | null;
  subTitle: string | null;
  subDescription: string | null;
  faculty: { id: string; name: string } | null;
  order: number;
};

export type SerializedEvent = {
  id: string;
  eventDate: string; // ISO 문자열 (Date → string 직렬화됨)
  eventType: "CLASS" | "EVENT";
  title: string;
  weekNumber: number | null;
  description: string | null;
  cohort: { id: string; name: string } | null;
  sessions: SerializedSession[];
};

type CalendarClientProps = {
  events: SerializedEvent[];
  year: number;
  month: number;
};

// ============================================================
// 상수
// ============================================================

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 세션 카테고리 한국어 레이블
const categoryLabels: Record<SerializedSession["category"], string> = {
  CLASSICS: "고전 읽기",
  ENGLISH: "영어",
  SPEECH: "스피치 특강",
  SPECIAL_LECTURE: "특강",
  CASE_STUDY: "케이스스터디",
};

// 케이스스터디 분야 레이블
const reportCategoryLabels: Record<string, string> = {
  "management-book": "경영서",
  "classic-book": "고전명작",
  "business-practice": "기업실무·한국경제사",
};

// ============================================================
// 유틸리티
// ============================================================

/** 특정 날짜(year, month, day)에 해당하는 이벤트 목록 반환 */
function getEventsForDay(events: SerializedEvent[], year: number, month: number, day: number) {
  return events.filter((e) => {
    const d = new Date(e.eventDate);
    return d.getFullYear() === year && d.getMonth() + 1 === month && d.getDate() === day;
  });
}

/** 날짜를 "MM월 DD일 (요일)" 형식으로 포맷 */
function formatDateKo(year: number, month: number, day: number) {
  const date = new Date(year, month - 1, day);
  const weekday = DAY_NAMES[date.getDay()];
  return `${month}월 ${day}일 (${weekday})`;
}

// ============================================================
// 이벤트 상세 패널
// ============================================================

function EventDetail({ event }: { event: SerializedEvent }) {
  const date = new Date(event.eventDate);
  const dateStr = formatDateKo(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );

  return (
    <div className="space-y-4">
      {/* 날짜 + 제목 */}
      <div className="border-b border-[#D9D9D9] pb-4">
        <p className="text-sm font-medium text-[#666666]">{dateStr}</p>
        <h3 className="mt-1 text-lg font-bold text-[#1a1a1a]">{event.title}</h3>
        {event.cohort ? (
          <p className="mt-0.5 text-sm text-[#666666]">{event.cohort.name}</p>
        ) : null}
      </div>

      {/* 행사: 설명만 표시 */}
      {event.eventType === "EVENT" ? (
        <div>
          {event.description ? (
            <p className="text-sm leading-relaxed text-[#1a1a1a] whitespace-pre-wrap">
              {event.description}
            </p>
          ) : (
            <p className="text-sm text-[#666666]">상세 내용이 없습니다.</p>
          )}
        </div>
      ) : null}

      {/* 수업: 세션 목록 표시 */}
      {event.eventType === "CLASS" && event.sessions.length > 0 ? (
        <div className="space-y-5">
          {event.sessions.map((session, i) => (
            <div key={i} className="space-y-1">
              {/* 카테고리 + 분야(케이스스터디) + 교수님 이름 */}
              <p className="text-[1.05rem] font-semibold text-[#1a1a1a]">
                {session.category === "CASE_STUDY" && session.reportCategory
                  ? `케이스스터디 (${reportCategoryLabels[session.reportCategory] ?? session.reportCategory})`
                  : categoryLabels[session.category]}
                {session.faculty ? (
                  <span className="ml-1.5 font-normal text-[#666666]">
                    ({session.faculty.name} 교수님)
                  </span>
                ) : null}
              </p>

              {/* 주요 내용 — 케이스스터디는 경영서 / 기업실무 블록으로 구분 */}
              {session.category === "CASE_STUDY" ? (
                <div className="space-y-3">
                  {/* 경영서 블록 */}
                  {session.content ? (
                    <div>
                      <span className="inline-block text-xs font-medium text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded">경영서</span>
                      <p className="text-sm text-[#1a1a1a] mt-1">{session.content}</p>
                    </div>
                  ) : null}

                  {/* 기업실무 블록 */}
                  {session.subTitle || session.subDescription ? (
                    <div>
                      <span className="inline-block text-xs font-medium text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded">기업실무</span>
                      {session.subTitle ? (
                        <p className="text-sm text-[#1a1a1a] mt-1">{session.subTitle}</p>
                      ) : null}
                      {session.subDescription ? (
                        <p className="text-sm leading-relaxed text-[#666666] whitespace-pre-wrap mt-0.5">
                          {session.subDescription}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : session.content ? (
                <p className="text-sm text-[#1a1a1a]">{session.content}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* 비고 */}
      {event.description && event.eventType === "CLASS" ? (
        <div className="border-t border-[#D9D9D9] pt-3">
          <p className="text-xs text-[#666666]">비고: {event.description}</p>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// 메인 캘린더 컴포넌트
// ============================================================

export function CalendarClient({ events: initialEvents, year: initialYear, month: initialMonth }: CalendarClientProps) {
  const today = new Date();

  // 현재 표시 중인 연/월과 이벤트 — 서버에서 받은 초기값으로 시작
  const [currentYear, setCurrentYear] = useState(initialYear);
  const [currentMonth, setCurrentMonth] = useState(initialMonth);
  const [events, setEvents] = useState(initialEvents);

  // 선택된 날짜 (클릭 시 오른쪽 패널에 표시)
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // 월 이동 중 로딩 상태 (버튼 비활성화용)
  const [isPending, startTransition] = useTransition();

  // 선택된 날짜의 이벤트 목록
  const selectedEvents = selectedDay
    ? getEventsForDay(events, currentYear, currentMonth, selectedDay)
    : [];

  // ── 월 이동 핸들러 — router.push 없이 서버 액션으로 데이터만 교체 ──
  function navigateMonth(year: number, month: number) {
    setSelectedDay(null);
    startTransition(async () => {
      const next = await getSerializedScheduleEvents(year, month);
      setCurrentYear(year);
      setCurrentMonth(month);
      setEvents(next);
    });
  }

  function goPrevMonth() {
    const prev = currentMonth === 1
      ? { year: currentYear - 1, month: 12 }
      : { year: currentYear, month: currentMonth - 1 };
    navigateMonth(prev.year, prev.month);
  }

  function goNextMonth() {
    const next = currentMonth === 12
      ? { year: currentYear + 1, month: 1 }
      : { year: currentYear, month: currentMonth + 1 };
    navigateMonth(next.year, next.month);
  }

  // 오늘 날짜로 이동 — 다른 달이면 데이터 재조회 후 오늘 선택
  function goToday() {
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth() + 1;
    if (currentYear === todayYear && currentMonth === todayMonth) {
      setSelectedDay(today.getDate());
    } else {
      startTransition(async () => {
        const next = await getSerializedScheduleEvents(todayYear, todayMonth);
        setCurrentYear(todayYear);
        setCurrentMonth(todayMonth);
        setEvents(next);
        setSelectedDay(today.getDate());
      });
    }
  }

  // 현재 보고 있는 달이 오늘 달인지 여부
  const isCurrentMonth =
    currentYear === today.getFullYear() && currentMonth === today.getMonth() + 1;

  // ── 달력 그리드 계산 ──────────────────────────────────
  // 해당 월 1일의 요일(0=일요일)과 해당 월의 마지막 날
  const firstDayOfWeek = new Date(currentYear, currentMonth - 1, 1).getDay();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

  // 셀 배열: 빈 셀(null) + 날짜 숫자
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[450px_600px] md:justify-center">
      {/* ── 달력 그리드 ── */}
      <div className="space-y-4">
        {/* 헤더: 이전/다음 월 이동 + 오늘 버튼 */}
        <div className="flex items-center justify-between">
          {/* 월 이동 그룹 */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={goPrevMonth}
              disabled={isPending}
              className="text-[#1a1a1a] hover:bg-[#EFF6FF] disabled:opacity-40"
            >
              <ChevronLeft className="size-5" />
            </Button>
            <h3 className={cn("text-lg font-bold text-[#1a1a1a] transition-opacity w-32 text-center", isPending && "opacity-50")}>
              {currentYear}년 {currentMonth}월
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={goNextMonth}
              disabled={isPending}
              className="text-[#1a1a1a] hover:bg-[#EFF6FF] disabled:opacity-40"
            >
              <ChevronRight className="size-5" />
            </Button>
          </div>

          {/* 오늘 버튼 — 오늘 달+날짜가 이미 선택된 경우 비활성 */}
          <Button
            variant="outline"
            size="sm"
            onClick={goToday}
            disabled={isPending || (isCurrentMonth && selectedDay === today.getDate())}
            className="h-8 px-3 text-xs border-[#D9D9D9] text-[#1a1a1a] hover:bg-[#EFF6FF] disabled:opacity-40"
          >
            오늘
          </Button>
        </div>

        {/* 요일 헤더 */}
        <div className="grid grid-cols-7 text-center">
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              className={cn(
                "py-2 text-sm font-semibold",
                i === 0 ? "text-red-400" : i === 6 ? "text-blue-500" : "text-[#666666]"
              )}
            >
              {d}
            </div>
          ))}
        </div>

        {/* 날짜 셀 */}
        <div className="grid grid-cols-7">
          {cells.map((day, i) => {
            if (day === null) {
              return <div key={`empty-${i}`} className="flex justify-center py-0.5" />;
            }

            const dayEvents = getEventsForDay(events, currentYear, currentMonth, day);
            const hasClass = dayEvents.some((e) => e.eventType === "CLASS");
            const hasEvent = dayEvents.some((e) => e.eventType === "EVENT");
            const isSelected = selectedDay === day;
            const isToday =
              today.getFullYear() === currentYear &&
              today.getMonth() + 1 === currentMonth &&
              today.getDate() === day;
            // 요일 계산 (0=일, 6=토)
            const weekday = (firstDayOfWeek + day - 1) % 7;
            const isSunday = weekday === 0;
            const isSaturday = weekday === 6;

            // 원형 배경색: 선택됨 → 진한 색, 이벤트만 → 연한 색, 없음 → 투명
            const circleBg = isSelected
              ? hasClass
                ? "bg-[#2563EB] hover:bg-blue-700"
                : hasEvent
                  ? "bg-green-500 hover:bg-green-600"
                  : "bg-[#555] hover:bg-[#333]"
              : hasClass
                ? "bg-blue-100 hover:bg-blue-300"
                : hasEvent
                  ? "bg-green-100 hover:bg-green-300"
                  : isToday
                    ? "hover:bg-blue-50"
                    : "hover:bg-gray-100";

            // 날짜 숫자 색상
            const textColor = isSelected
              ? "text-white font-bold"
              : isToday
                ? "text-[#2563EB] font-bold"
                : isSunday
                  ? "text-red-400"
                  : isSaturday
                    ? "text-blue-500"
                    : "text-[#1a1a1a]";

            return (
              <div key={day} className="flex justify-center py-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedDay(isSelected ? null : day)}
                  className={cn(
                    "size-10 rounded-full flex items-center justify-center transition-colors text-base font-medium",
                    dayEvents.length > 0 || isSelected ? "cursor-pointer" : "cursor-default",
                    // 오늘: 파란 테두리 원 (이벤트·선택 없을 때)
                    isToday && !isSelected && !hasClass && !hasEvent && "ring-2 ring-[#2563EB]",
                    // 오늘이면서 이벤트 있을 때: 테두리 + 연한 배경
                    isToday && !isSelected && (hasClass || hasEvent) && "ring-2 ring-[#2563EB]",
                    circleBg,
                    textColor,
                  )}
                >
                  {day}
                </button>
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="flex items-center gap-4 pt-2">
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-blue-100 ring-1 ring-blue-300" />
            <span className="text-xs text-[#666666]">정기수업</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-3 rounded-full bg-green-100 ring-1 ring-green-300" />
            <span className="text-xs text-[#666666]">행사</span>
          </div>
        </div>
      </div>

      {/* ── 오른쪽 상세 패널 ── */}
      <div className="rounded-2xl border border-[#D9D9D9] bg-white p-5 shadow-[var(--shadow-soft)] min-h-[300px]">
        {selectedDay === null ? (
          // 날짜 미선택 상태
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-[#1a1a1a]">{currentYear}년 {currentMonth}월</p>
            <p className="text-sm text-[#666666]">날짜를 클릭하면<br />일정을 확인할 수 있습니다.</p>
            {events.length > 0 ? (
              <p className="mt-2 text-xs text-[#2563EB]">이번 달 일정 {events.length}개</p>
            ) : (
              <p className="mt-2 text-xs text-[#666666]">이번 달 등록된 일정이 없습니다.</p>
            )}
          </div>
        ) : selectedEvents.length === 0 ? (
          // 선택한 날짜에 일정 없음
          <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-[#1a1a1a]">{formatDateKo(currentYear, currentMonth, selectedDay)}</p>
            <p className="text-sm text-[#666666]">등록된 일정이 없습니다.</p>
          </div>
        ) : (
          // 선택한 날짜의 이벤트 표시
          <div className="space-y-6">
            {selectedEvents.map((event) => (
              <EventDetail key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
