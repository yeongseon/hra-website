/**
 * Google Sheets 유틸리티 단위 테스트
 *
 * 역할:
 * - 공개 모집/관리 화면에서 사용하는 시트 URL 파싱 로직의 기본 동작을 검증합니다.
 * - 순수 함수(`extractSheetId`)를 대상으로 빠르게 회귀를 감지합니다.
 */

import { describe, expect, it } from "vitest";
import { extractSheetId } from "@/lib/google-sheets";

describe("extractSheetId", () => {
  it("정상적인 Google Sheets URL에서 시트 ID를 추출한다", () => {
    expect(
      extractSheetId("https://docs.google.com/spreadsheets/d/abc123DEF456/edit#gid=0")
    ).toBe("abc123DEF456");
  });

  it("시트 URL 형식이 아니면 null을 반환한다", () => {
    expect(extractSheetId("https://example.com/not-a-sheet")).toBeNull();
  });

  it("URL이 아닌 문자열이 들어오면 null을 반환한다", () => {
    expect(extractSheetId("not-a-valid-url")).toBeNull();
  });
});
