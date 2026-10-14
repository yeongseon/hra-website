/**
 * KST 날짜·시각 공통 헬퍼의 자정·월 경계 회귀 테스트입니다 (#125).
 */
import { describe, expect, it } from "vitest";
import {
  formatKstCsvDateTime,
  formatKstDate,
  formatKstDateTime,
  formatKstDateTimeWithSeconds,
  getKstYearMonth,
  toKstDateInput,
} from "@/lib/date-time";

describe("한국 시간 날짜·시각", () => {
  it("UTC 15시를 한국 시간 다음 날 0시로 표시한다", () => {
    const before = new Date("2026-10-13T14:59:59.000Z");
    const after = new Date("2026-10-13T15:00:00.000Z");
    expect(toKstDateInput(before)).toBe("2026-10-13");
    expect(toKstDateInput(after)).toBe("2026-10-14");
    expect(formatKstDate(before)).toBe("2026. 10. 13.");
    expect(formatKstDate(after)).toBe("2026. 10. 14.");
    expect(formatKstDateTime(after)).toContain("00:00");
    expect(formatKstDateTimeWithSeconds(after)).toContain("00:00:00");
  });

  it("월 경계의 연월과 CSV 시각을 한국 시간으로 계산한다", () => {
    const value = new Date("2026-10-31T15:30:45.000Z");
    expect(getKstYearMonth(value)).toEqual({ year: 2026, month: 11 });
    expect(toKstDateInput(value)).toBe("2026-11-01");
    expect(formatKstCsvDateTime(value)).toBe("2026-11-01 00:30:45");
  });

  it("비어 있는 날짜 입력은 빈 문자열로 유지한다", () => {
    expect(toKstDateInput(null)).toBe("");
  });
});
