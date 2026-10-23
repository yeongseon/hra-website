// @vitest-environment node
/**
 * 공개 일정 API의 필수 연·월 입력과 한국 벽시계 DTO·고정 오류 경계를 검증합니다.
 * 중복·미등록 query는 DB 서비스 전에 거부하고 SQL·운영 메타데이터를 응답하지 않습니다.
 */
import { beforeEach, expect, it, vi } from "vitest";
import { apiV1ErrorResponseSchema, apiV1ScheduleResponseSchema } from "@hra/contracts/api-v1";

const mocks = vi.hoisted(() => ({ list: vi.fn(), log: vi.fn() }));
vi.mock("@/features/schedule/public/service", () => ({ listPublicScheduleApiMonth: mocks.list }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));

import { GET } from "@/app/api/v1/schedule/route";

const base = "https://qa.invalid/api/v1/schedule";
const event = {
  id: "11111111-1111-4111-8111-111111111111",
  calendarDate: "2026-10-31", startTime: "23:30", endTime: "23:59",
  eventType: "CLASS", title: "합성 늦은 수업", weekNumber: 3, description: null,
  cohort: { id: "22222222-2222-4222-8222-222222222222", name: "합성 기수" },
  sessions: [{ category: "CLASSICS", content: "고전", reportCategory: null,
    subTitle: null, subDescription: null,
    faculty: { id: "33333333-3333-4333-8333-333333333333", name: "합성 교수" }, order: 0 }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.list.mockResolvedValue({ year: 2026, month: 10, timeZone: "Asia/Seoul", events: [event] });
});

it("공개 한국 달력 날짜·벽시각만 응답하고 UTC 순간으로 바꾸지 않는다", async () => {
  const response = await GET(new Request(`${base}?year=2026&month=10`));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(mocks.list).toHaveBeenCalledWith(2026, 10);
  const body = await response.json();
  expect(apiV1ScheduleResponseSchema.parse(body)).toEqual(body);
  expect(body).toEqual({ year: 2026, month: 10, timeZone: "Asia/Seoul", events: [event] });
  expect(JSON.stringify(body)).not.toMatch(/eventDate|googleSheetId|formUrl|facultyEmail/);
});

it.each([
  "",
  "?year=2026",
  "?month=10",
  "?year=2026&month=10&month=11",
  "?year=2026&month=10&unknown=1",
  "?year=1899&month=10",
  "?year=2101&month=10",
  "?year=2026&month=13",
])("잘못된 연·월 query %s는 서비스 접근 없이 400이다", async (query) => {
  const response = await GET(new Request(`${base}${query}`));
  expect(response.status).toBe(400);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const body = await response.json();
  expect(apiV1ErrorResponseSchema.parse(body)).toEqual(body);
  expect(body.error.code).toBe("INVALID_INPUT");
  expect(mocks.list).not.toHaveBeenCalled();
});

it("DB 장애는 내부 일정·SQL을 숨긴 503으로 끝난다", async () => {
  mocks.list.mockRejectedValueOnce(new Error("SELECT internal_event FROM schedule_events WHERE secret='비공개'"));
  const response = await GET(new Request(`${base}?year=2026&month=10`));
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(apiV1ErrorResponseSchema.parse(body)).toEqual(body);
  expect(body.error.code).toBe("UNAVAILABLE");
  expect(JSON.stringify(body)).not.toMatch(/SELECT|internal_event|비공개/);
  expect(mocks.log).toHaveBeenCalledOnce();
});
