/**
 * 공개 일정의 기존 월 범위·공개 조건·관계 정렬과 Web 직렬화 동작을 구조 이동 전에 고정합니다.
 * 한국 벽시계를 실제 UTC 순간으로 재해석하지 않아야 합니다.
 */
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { query: { scheduleEvents: { findMany: mocks.findMany } } } }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { getScheduleEvents, getSerializedScheduleEvents } from "@/features/schedule/actions";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.findMany.mockResolvedValue([]);
});
afterEach(() => vi.useRealTimers());

it("공개 일정은 한국 달력 월의 UTC 필드 범위와 공개 조건·세션 순서로 조회한다", async () => {
  await getScheduleEvents(2026, 10);
  const options = mocks.findMany.mock.calls[0][0];
  const where = new PgDialect().sqlToQuery(options.where);
  expect(where.params).toContain(true);
  expect(where.params.filter((value: unknown) => typeof value === "string" && value.startsWith("2026-10"))).toEqual([
    "2026-10-01T00:00:00.000Z",
    "2026-10-31T23:59:59.000Z",
  ]);
  expect(new PgDialect().sqlToQuery(options.orderBy[0]).sql.toLowerCase()).toContain("asc");
  expect(new PgDialect().sqlToQuery(options.with.sessions.orderBy[0]).sql.toLowerCase()).toContain("asc");
  expect(Object.keys(options.columns)).toEqual([
    "id", "eventDate", "endTime", "eventType", "title", "weekNumber", "description",
  ]);
  expect(options.with.cohort.columns).toEqual({ id: true, name: true });
  expect(Object.keys(options.with.sessions.columns)).toEqual([
    "category", "content", "reportCategory", "subTitle", "subDescription", "order",
  ]);
  expect(options.with.sessions.with.faculty.columns).toEqual({ id: true, name: true });
});

it("월 이동 직렬화는 한국 벽시계 ISO 필드를 보존하고 내부 관계 열을 제외한다", async () => {
  mocks.findMany.mockResolvedValueOnce([{
    id: "11111111-1111-4111-8111-111111111111",
    eventDate: new Date("2026-10-31T23:30:00.000Z"), eventType: "CLASS",
    title: "합성 늦은 수업", weekNumber: 3, description: null,
    isPublic: true, googleSheetId: "내부 일정 열",
    cohort: { id: "22222222-2222-4222-8222-222222222222", name: "합성 기수", googleSheetId: "내부 시트" },
    sessions: [{ category: "CLASSICS", content: "고전", reportCategory: null, subTitle: null,
      subDescription: null, order: 0, faculty: { id: "33333333-3333-4333-8333-333333333333",
        name: "합성 교수", email: "private@fixture.invalid" } }],
  }]);

  expect(await getSerializedScheduleEvents(2026, 10)).toEqual([{
    id: "11111111-1111-4111-8111-111111111111",
    eventDate: "2026-10-31T23:30:00.000Z", eventType: "CLASS",
    title: "합성 늦은 수업", weekNumber: 3, description: null,
    cohort: { id: "22222222-2222-4222-8222-222222222222", name: "합성 기수" },
    sessions: [{ category: "CLASSICS", content: "고전", reportCategory: null, subTitle: null,
      subDescription: null, order: 0, faculty: { id: "33333333-3333-4333-8333-333333333333", name: "합성 교수" } }],
  }]);
});

it("Web의 잘못된 연·월은 현재 한국 달로 보정한다", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T00:00:00.000Z"));
  await getScheduleEvents(0, 13);
  const where = new PgDialect().sqlToQuery(mocks.findMany.mock.calls[0][0].where);
  expect(where.params.filter((value: unknown) => typeof value === "string" && value.startsWith("2026-10"))).toEqual([
    "2026-10-01T00:00:00.000Z",
    "2026-10-31T23:59:59.000Z",
  ]);
});
