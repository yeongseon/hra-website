/**
 * 자유 입력 답변을 JSON으로 오인하지 않고 체크박스 답변만 배열로 처리합니다 (#130).
 */
import { describe, expect, it } from "vitest";
import { parseCheckboxAnswerValue } from "@/features/applications/answer-format";

describe("지원서 답변 표시", () => {
  it("자유 입력의 JSON 형태 문자열을 그대로 보존한다", () => {
    expect(parseCheckboxAnswerValue("[]", "SHORT_ANSWER")).toBeNull();
    expect(parseCheckboxAnswerValue('["답변"]', "LONG_ANSWER")).toBeNull();
  });

  it("체크박스 답변만 배열로 해석한다", () => {
    expect(parseCheckboxAnswerValue('["첫째","둘째"]', "CHECKBOX"))
      .toEqual(["첫째", "둘째"]);
    expect(parseCheckboxAnswerValue("잘못된 값", "CHECKBOX")).toBeNull();
  });
});
