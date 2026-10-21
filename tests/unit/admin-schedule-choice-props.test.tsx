/**
 * 관리자 일정 페이지가 선택 목록에 필요한 교수·기수 필드만 조회하는지 검증합니다.
 * 실제 Drizzle SQL과 실제 페이지 JSX를 확인하고, 수정 폼의 값·세션 ID·카테고리 필터를 보존합니다.
 * DB 연결은 실행하지 않으며 합성 행과 관리자 인가 결과만 대체합니다.
 */
import { isValidElement, type ComponentProps } from "react";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { getTableName, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  select: vi.fn(), requireAdmin: vi.fn(), getEvent: vi.fn(), create: vi.fn(), update: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/features/schedule/actions", () => ({
  getScheduleEvent: mocks.getEvent, createScheduleEvent: mocks.create, updateScheduleEvent: mocks.update,
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));

import NewSchedulePage from "@/app/(admin)/admin/schedule/new/page";
import EditSchedulePage from "@/app/(admin)/admin/schedule/[id]/page";
import { ScheduleForm } from "@/app/(admin)/admin/schedule/_components/schedule-form";

const eventId = "50000000-0000-4000-8000-000000000001";
const sessionId = "60000000-0000-4000-8000-000000000001";
const compiler = drizzle(neon("postgresql://synthetic:synthetic@choice-qa.invalid/synthetic"), { schema });
const statements: string[] = [];
const facultyRows = [
  { id: "classic", name: "가 고전 교수", category: "CLASSICS", currentPosition: "내부 약력", imageUrl: "내부 이미지", internalSentinel: "제외" },
  { id: "business", name: "나 경영 교수", category: "BUSINESS", currentPosition: "내부 약력", internalSentinel: "제외" },
  { id: "lecture", name: "다 영어 교수", category: "LECTURE", currentPosition: "내부 약력", internalSentinel: "제외" },
];
const cohortRows = [
  { id: "cohort-new", name: "합성 새 기수", order: 0, googleSheetId: "내부 연결", internalSentinel: "제외" },
  { id: "cohort-old", name: "합성 이전 기수", order: 5, googleFormUrl: "내부 연결", internalSentinel: "제외" },
];

/** 편집 중 유지해야 하는 원래 일정·세션 값을 합성 데이터로 구성합니다. */
function eventFixture() {
  return {
    id: eventId, eventDate: new Date("2026-10-14T09:30:00.000Z"), endTime: "12:00",
    eventType: "CLASS", title: "합성 수업", cohortId: "cohort-new", weekNumber: 3,
    description: "수정 전 안내", isPublic: false,
    sessions: [{ id: sessionId, category: "CLASSICS", facultyId: "classic", content: "기존 수업 내용",
      reportCategory: null, subTitle: null, subDescription: null, order: 4 }],
  };
}

/** 실제 페이지가 반환하는 폼 요소의 props를 조사합니다. */
function propsOf(element: Awaited<ReturnType<typeof NewSchedulePage>>) {
  if (!isValidElement<ComponentProps<typeof ScheduleForm>>(element) || element.type !== ScheduleForm) {
    throw new Error("일정 페이지의 폼을 찾지 못했습니다.");
  }
  return element.props;
}

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  statements.length = 0;
  mocks.requireAdmin.mockResolvedValue({ user: { id: "synthetic-admin", role: "ADMIN" } });
  mocks.getEvent.mockResolvedValue(eventFixture());
  mocks.select.mockImplementation((fields?: Record<string, AnyPgColumn>) => ({
    from: (table: PgTable) => ({
      orderBy: async (order: SQL) => {
        const builder = fields ? compiler.select(fields) : compiler.select();
        statements.push(builder.from(table).orderBy(order).toSQL().sql);
        const rows: Record<string, unknown>[] = getTableName(table) === "faculty" ? facultyRows : cohortRows;
        // SELECT 필드 선택을 일반적으로 적용하며 허용 필드 목록을 이중 구현하지 않습니다.
        return rows.map(row => fields ? Object.fromEntries(Object.keys(fields).map(key => [key, row[key]])) : { ...row });
      },
    }),
  }));
});

describe("관리자 일정의 최소 선택 목록", () => {
  it.each(["등록", "수정"])("%s 페이지는 필요한 선택 필드와 정렬만 유지한다", async (kind) => {
    const element = kind === "등록" ? await NewSchedulePage()
      : await EditSchedulePage({ params: Promise.resolve({ id: eventId }) });
    const props = propsOf(element);
    expect(props.faculties).toStrictEqual([
      { id: "classic", name: "가 고전 교수", category: "CLASSICS" },
      { id: "business", name: "나 경영 교수", category: "BUSINESS" },
      { id: "lecture", name: "다 영어 교수", category: "LECTURE" },
    ]);
    expect(props.cohorts).toStrictEqual([
      { id: "cohort-new", name: "합성 새 기수" }, { id: "cohort-old", name: "합성 이전 기수" },
    ]);
    expect(statements).toStrictEqual([
      'select "id", "name", "category" from "faculty" order by "faculty"."name" asc',
      'select "id", "name" from "cohorts" order by "cohorts"."order" asc',
    ]);
    expect(mocks.requireAdmin).toHaveBeenCalledOnce();
    expect(mocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(mocks.select.mock.invocationCallOrder[0]);
  });

  it("수정 폼은 기존 날짜·공개값·세션 UUID와 편집 내용을 유지한다", async () => {
    const element = await EditSchedulePage({ params: Promise.resolve({ id: eventId }) });
    expect(propsOf(element).defaultValues).toStrictEqual({
      eventDate: "2026-10-14", startTime: "09:30", endTime: "12:00", eventType: "CLASS",
      title: "합성 수업", cohortId: "cohort-new", weekNumber: 3, description: "수정 전 안내", isPublic: false,
      sessions: [{ serverId: sessionId, category: "CLASSICS", facultyId: "classic", content: "기존 수업 내용",
        reportCategory: null, subTitle: null, subDescription: null, order: 4 }],
    });
    const view = render(element);
    fireEvent.change(view.getByDisplayValue("기존 수업 내용"), { target: { value: "편집한 수업 내용" } });
    const input = view.container.querySelector<HTMLInputElement>('input[name="sessionsJson"]');
    expect(JSON.parse(input?.value ?? "[]")).toEqual([
      expect.objectContaining({ serverId: sessionId, facultyId: "classic", content: "편집한 수업 내용", order: 4 }),
    ]);
  });

  it("실제 교수 선택 메뉴는 세션 카테고리에 맞는 교수만 표시한다", async () => {
    render(await EditSchedulePage({ params: Promise.resolve({ id: eventId }) }));
    const choice = screen.getAllByRole("combobox").find(button => button.textContent?.includes("가 고전 교수"));
    if (!choice) throw new Error("선택된 교수의 메뉴를 찾지 못했습니다.");
    fireEvent.click(choice);
    expect(await screen.findByRole("option", { name: "가 고전 교수" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "나 경영 교수" })).toBeNull();
    expect(screen.queryByRole("option", { name: "다 영어 교수" })).toBeNull();
  });

  it.each(["등록", "수정"])("%s 페이지는 관리자 인가 실패 시 선택 목록을 읽지 않는다", async (kind) => {
    mocks.requireAdmin.mockRejectedValue(new Error("DENIED"));
    const run = () => kind === "등록" ? NewSchedulePage()
      : EditSchedulePage({ params: Promise.resolve({ id: eventId }) });
    await expect(run()).rejects.toThrow("DENIED");
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.getEvent).not.toHaveBeenCalled();
  });

  it("잘못된 경로 ID와 없는 일정은 선택 목록 조회 없이 종료한다", async () => {
    await expect(EditSchedulePage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.getEvent).not.toHaveBeenCalled();
    mocks.getEvent.mockResolvedValue(null);
    await expect(EditSchedulePage({ params: Promise.resolve({ id: eventId }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
