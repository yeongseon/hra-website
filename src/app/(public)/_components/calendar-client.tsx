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

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  CLASSICS: "고전명작",
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
              <p className="text-sm font-semibold text-[#1a1a1a]">
                {session.category === "CASE_STUDY" && session.reportCategory
                  ? `케이스스터디 (${reportCategoryLabels[session.reportCategory] ?? session.reportCategory})`
                  : categoryLabels[session.category]}
                {session.faculty ? (
                  <span className="ml-1.5 font-normal text-[#666666]">
                    ({session.faculty.name} 교수님)
                  </span>
                ) : null}
              </p>

              {/* 주요 내용 */}
              {session.content ? (
                <p className="text-sm text-[#1a1a1a]">{session.content}</p>
              ) : null}

              {/* 케이스스터디 전용: 제목 + 설명 */}
              {session.category === "CASE_STUDY" ? (
                <>
                  {session.subTitle ? (
                    <p className="text-sm text-[#1a1a1a]">{session.subTitle}</p>
                  ) : null}
                  {session.subDescription ? (
                    <p className="text-sm leading-relaxed text-[#666666] whitespace-pre-wrap">
                      {session.subDescription}
                    </p>
                  ) : null}
                </>
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

export function CalendarClient({ events, year, month }: CalendarClientProps) {
  const router = useRouter();
  const today = new Date();

  // 선택된 날짜 (클릭 시 오른쪽 패널에 표시)
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  // 선택된 날짜의 이벤트 목록
  const selectedEvents = selectedDay
    ? getEventsForDay(events, year, month, selectedDay)
    : [];

  // ── 월 이동 핸들러 ──────────────────────────────────────
  function goPrevMonth() {
    setSelectedDay(null);
    const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
    router.push(`/?year=${prev.year}&month=${prev.month}`);
  }

  function goNextMonth() {
    setSelectedDay(null);
    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
    router.push(`/?year=${next.year}&month=${next.month}`);
  }

  // ── 달력 그리드 계산 ──────────────────────────────────
  // 해당 월 1일의 요일(0=일요일)과 해당 월의 마지막 날
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();

  // 셀 배열: 빈 셀(null) + 날짜 숫자
  const cells: (number | null)[] = [
    ...Array<null>(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-[1fr_420px]">
      {/* ── 달력 그리드 ── */}
      <div className="space-y-4">
        {/* 헤더: 이전/다음 월 이동 */}
        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={goPrevMonth}
            className="text-[#1a1a1a] hover:bg-[#EFF6FF]"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <h3 className="text-lg font-bold text-[#1a1a1a]">
            {year}년 {month}월
          </h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={goNextMonth}
            className="text-[#1a1a1a] hover:bg-[#EFF6FF]"
          >
            <ChevronRight className="size-5" />
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

            const dayEvents = getEventsForDay(events, year, month, day);
            const hasClass = dayEvents.some((e) => e.eventType === "CLASS");
            const hasEvent = dayEvents.some((e) => e.eventType === "EVENT");
            const isSelected = selectedDay === day;
            const isToday =
              today.getFullYear() === year &&
              today.getMonth() + 1 === month &&
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
            <p className="text-sm font-medium text-[#1a1a1a]">{year}년 {month}월</p>
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
            <p className="text-sm font-medium text-[#1a1a1a]">{formatDateKo(year, month, selectedDay)}</p>
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
