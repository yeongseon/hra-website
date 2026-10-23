// @vitest-environment node
/**
 * 일정 서비스의 한국 벽시계 API 출력과 Web ISO 직렬화를 서로 구분해 검증합니다.
 * 같은 23:30 일정에 +9시간을 다시 적용해 다음 날로 밀지 않습니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({ findPublicScheduleEvents: vi.fn() }));
vi.mock("@/features/schedule/public/repository", () => repository);

import { listPublicScheduleApiMonth, listPublicScheduleMonth, serializePublicScheduleEvents } from "@/features/schedule/public/service";

const event = {
  id: "11111111-1111-4111-8111-111111111111",
  eventDate: new Date("2026-10-31T23:30:00.000Z"), endTime: "23:59",
  eventType: "CLASS" as const, title: "합성 늦은 수업", weekNumber: 3,
  description: null,
  cohort: { id: "22222222-2222-4222-8222-222222222222", name: "합성 기수" },
  sessions: [{ category: "CLASSICS" as const, content: "고전", reportCategory: null,
    subTitle: null, subDescription: null,
    faculty: { id: "33333333-3333-4333-8333-333333333333", name: "합성 교수" }, order: 0 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  repository.findPublicScheduleEvents.mockResolvedValue([event]);
});

it("API는 10월 31일 23:30 KST 벽시계와 명시적 시간대를 반환한다", async () => {
  const result = await listPublicScheduleApiMonth(2026, 10);
  expect(repository.findPublicScheduleEvents).toHaveBeenCalledWith(
    new Date("2026-10-01T00:00:00.000Z"), new Date("2026-10-31T23:59:59.000Z"),
  );
  expect(result).toEqual({
    year: 2026, month: 10, timeZone: "Asia/Seoul",
    events: [{
      id: event.id, calendarDate: "2026-10-31", startTime: "23:30", endTime: "23:59",
      eventType: "CLASS", title: "합성 늦은 수업", weekNumber: 3, description: null,
      cohort: event.cohort, sessions: event.sessions,
    }],
  });
  expect(JSON.stringify(result)).not.toContain("eventDate");
});

it("Web의 기존 ISO 벽시계 직렬화는 유지하고 API 전용 필드는 섞지 않는다", () => {
  expect(serializePublicScheduleEvents([event])).toEqual([{
    id: event.id, eventDate: "2026-10-31T23:30:00.000Z", eventType: "CLASS",
    title: "합성 늦은 수업", weekNumber: 3, description: null,
    cohort: event.cohort, sessions: event.sessions,
  }]);
});

it("허용 범위 밖 연·월은 저장소를 열기 전에 거부한다", async () => {
  await expect(listPublicScheduleMonth(1899, 10)).rejects.toThrow("SCHEDULE_MONTH_INVALID");
  await expect(listPublicScheduleMonth(2026, 13)).rejects.toThrow("SCHEDULE_MONTH_INVALID");
  expect(repository.findPublicScheduleEvents).not.toHaveBeenCalled();
});
