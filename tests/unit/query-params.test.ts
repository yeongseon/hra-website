/**
 * 공개 쿼리의 연·월·페이지 검증과 범위 보정 테스트입니다 (#124).
 */
import { describe, expect, it } from "vitest";
import { parseCalendarMonth, parseListPage } from "@/lib/query-params";

const now = new Date(2026, 9, 14);

describe("캘린더 연·월", () => {
  it("정상 정수 연월을 유지한다", () => {
    expect(parseCalendarMonth("2025", "12", now)).toEqual({ year: 2025, month: 12 });
  });

  it.each(["abc", "2026x", "2026.5", "999999"])("잘못된 연도 %s는 현재 연도로 보정한다", (year) => {
    expect(parseCalendarMonth(year, "3", now)).toEqual({ year: 2026, month: 3 });
  });

  it.each(["0", "13", "abc", "1.5"])("잘못된 월 %s은 현재 월로 보정한다", (month) => {
    expect(parseCalendarMonth("2025", month, now)).toEqual({ year: 2025, month: 10 });
  });

  it("서버 액션의 숫자 인자도 범위를 검증한다", () => {
    expect(parseCalendarMonth(Number.NaN, 13, now)).toEqual({ year: 2026, month: 10 });
  });

  it("UTC 기준 전월 마지막 날에도 KST의 새 달을 기본값으로 사용한다", () => {
    expect(parseCalendarMonth(undefined, undefined, new Date("2026-10-31T15:00:00.000Z")))
      .toEqual({ year: 2026, month: 11 });
  });
});

describe("목록 페이지", () => {
  it.each([undefined, "abc", "0", "-1", "1.5", "1e2"])(
    "잘못된 페이지 %s는 첫 페이지로 보정한다",
    (page) => {
      expect(parseListPage(page, 31, 15)).toEqual({ currentPage: 1, totalPages: 3, startIndex: 0 });
    },
  );

  it("마지막 페이지를 넘는 값은 마지막 페이지로 보정한다", () => {
    expect(parseListPage("99999", 31, 15)).toEqual({ currentPage: 3, totalPages: 3, startIndex: 30 });
  });

  it("결과가 없어도 첫 페이지를 유지한다", () => {
    expect(parseListPage("12", 0, 15)).toEqual({ currentPage: 1, totalPages: 0, startIndex: 0 });
  });
});
