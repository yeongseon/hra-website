/**
 * 지원서 질문 저장 전 전체 배열의 선택지 규칙을 검증하는 회귀 테스트다.
 */
import { describe, expect, it } from "vitest";
import { saveQuestionsSchema } from "@/features/applications/question-validation";
import { applicationInputLimits } from "@/features/applications/input-limits";

const formId = "11111111-1111-4111-8111-111111111111";
const selectionTypes = ["MULTIPLE_CHOICE", "CHECKBOX", "DROPDOWN"] as const;

function question(type: (typeof selectionTypes)[number] | "SHORT_ANSWER" | "LONG_ANSWER", options?: { value: string; order: number }[]) {
  return { title: "질문", type, options };
}

function parse(questions: unknown[]) {
  return saveQuestionsSchema.safeParse({ formId, questions });
}

describe("지원서 질문 선택지 검증 (#94)", () => {
  it.each(selectionTypes)("%s 질문은 선택지가 없으면 거부한다", (type) => {
    for (const options of [undefined, []]) {
      const result = parse([question(type, options)]);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("선택형 질문에는 선택지가 하나 이상 필요합니다.");
        expect(result.error.issues[0].path).toEqual(["questions", 0, "options"]);
      }
    }
  });

  it("공백만 있는 선택지는 거부한다", () => {
    const result = parse([question("DROPDOWN", [{ value: "  ", order: 0 }])]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("선택지 내용을 입력해주세요.");
    }
  });

  it("선택지는 공개 답변 상한까지 저장하고 초과하면 거부한다 (#112)", () => {
    const atLimit = "가".repeat(applicationInputLimits.optionValue);
    expect(parse([question("DROPDOWN", [{ value: atLimit, order: 0 }])]).success).toBe(true);

    const tooLong = parse([question("DROPDOWN", [{ value: `${atLimit}가`, order: 0 }])]);
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) {
      expect(tooLong.error.issues[0].message).toBe("선택지는 1000자 이하여야 합니다.");
    }
  });

  it("trim 후 같은 선택지 값은 중복으로 거부한다", () => {
    const result = parse([question("CHECKBOX", [
      { value: "서울", order: 0 },
      { value: " 서울 ", order: 1 },
    ])]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("중복된 선택지는 저장할 수 없습니다.");
      expect(result.error.issues[0].path).toEqual(["questions", 0, "options", 1, "value"]);
    }
  });

  it("정상 선택지는 trim해 저장하고 대소문자는 구분한다", () => {
    const result = parse([question("MULTIPLE_CHOICE", [
      { value: " A ", order: 0 },
      { value: "a", order: 1 },
    ])]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.questions[0].options?.map((option) => option.value)).toEqual(["A", "a"]);
    }
  });

  it("일반 텍스트 질문에는 선택지가 없어도 된다", () => {
    expect(parse([question("SHORT_ANSWER"), question("LONG_ANSWER", [])]).success).toBe(true);
  });

  it("뒤쪽 질문이 잘못됐어도 전체 저장 요청을 거부한다", () => {
    const result = parse([
      question("SHORT_ANSWER"),
      question("DROPDOWN", []),
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["questions", 1, "options"]);
    }
  });

  it("같은 질문 ID가 두 번 전달되면 저장 전에 거부한다", () => {
    const id = "22222222-2222-4222-8222-222222222222";
    const result = parse([
      { ...question("SHORT_ANSWER"), id },
      { ...question("LONG_ANSWER"), id },
    ]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["questions", 1, "id"]);
    }
  });
});
