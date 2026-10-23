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
import { serializePublicScheduleEvents } from "@/features/schedule/public/service";
import { CalendarClient, type SerializedEvent } from "./calendar-client";

type CalendarSectionProps = {
  year: number;
  month: number;
};

export async function CalendarSection({ year, month }: CalendarSectionProps) {
  const events = await getScheduleEvents(year, month);

  // 초기 렌더와 월 이동 액션이 같은 벽시계 직렬화 규칙을 사용합니다.
  const serialized: SerializedEvent[] = serializePublicScheduleEvents(events);

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
