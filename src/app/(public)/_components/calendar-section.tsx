/**
 * 메인 페이지 캘린더 섹션 (서버 컴포넌트)
 *
 * 역할: 지정된 연월의 공개 일정을 DB에서 조회하고 CalendarClient에 전달
 * 사용 위치: src/app/(public)/page.tsx 최하단
 *
 * Date → string 직렬화:
 *   Next.js는 서버 컴포넌트에서 클라이언트 컴포넌트로 Date 객체를 직접 전달할 수 없음
 *   eventDate는 ISO 문자열로, faculty/cohort는 필요한 필드만 추출해 전달
 */

import { getScheduleEvents } from "@/features/schedule/actions";
import { CalendarClient, type SerializedEvent } from "./calendar-client";

type CalendarSectionProps = {
  year: number;
  month: number;
};

export async function CalendarSection({ year, month }: CalendarSectionProps) {
  const events = await getScheduleEvents(year, month);

  // Date 객체를 ISO 문자열로 직렬화 (클라이언트 컴포넌트 전달 가능하게)
  const serialized: SerializedEvent[] = events.map((e) => ({
    id: e.id,
    eventDate: e.eventDate.toISOString(),
    eventType: e.eventType,
    title: e.title,
    weekNumber: e.weekNumber ?? null,
    description: e.description ?? null,
    cohort: e.cohort ? { id: e.cohort.id, name: e.cohort.name } : null,
    sessions: e.sessions.map((s) => ({
      category: s.category,
      content: s.content ?? null,
      reportCategory: s.reportCategory ?? null,
      subTitle: s.subTitle ?? null,
      subDescription: s.subDescription ?? null,
      faculty: s.faculty ? { id: s.faculty.id, name: s.faculty.name } : null,
      order: s.order,
    })),
  }));

  return (
    <section className="py-24 px-4 w-full bg-[#FFFFFF]">
      <div className="max-w-7xl mx-auto w-full">
        {/* 섹션 헤더 */}
        <div className="flex flex-col items-center text-center mb-12">
          <h2 className="text-[40px] font-bold text-[#1a1a1a] tracking-tight">
            HRA 일정
          </h2>
          <div className="w-12 h-1 bg-[var(--brand)] mx-auto mt-4 mb-4" />
          <p className="text-lg text-[#666666] mt-0 font-medium">
            매주 토요일 수업과 주요 행사 일정을 확인하세요
          </p>
        </div>

        <CalendarClient events={serialized} year={year} month={month} />
      </div>
    </section>
  );
}
