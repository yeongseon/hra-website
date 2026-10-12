/**
 * 질문 삭제 경합에서 발생하는 DB 오류를 안전하게 구분하는 회귀 테스트 (#91).
 * Drizzle cause 래핑·무관한 오류·순환 참조를 검사합니다.
 */
import { describe, expect, it } from "vitest";
import { isConstraintViolation } from "@/lib/db/constraint-errors";
import { getTableConfig } from "drizzle-orm/pg-core";
import { applicationAnswers, applicationQuestionOptions } from "@/lib/db/schema";

const constraint = "application_answers_question_id_application_questions_id_fk";
const violation = { code: "23503", constraint };

describe("답변 보존 제약", () => {
  it("직접 발생한 FK 오류와 Drizzle cause를 인식", () => {
    expect(isConstraintViolation(violation, "23503", constraint)).toBe(true);
    expect(isConstraintViolation(new Error("쿼리 실패", { cause: violation }), "23503", constraint)).toBe(true);
  });

  it.each([null, undefined, "23503", {}, { code: "23505", constraint },
    { code: "23503", constraint: "another_fk" }])("무관한 오류는 일치하지 않음: %j", (error) => {
    expect(isConstraintViolation(error, "23503", constraint)).toBe(false);
  });

  it("순환 cause는 무한 순회하지 않음", () => {
    const error: { cause?: unknown } = {};
    error.cause = error;
    expect(isConstraintViolation(error, "23503", constraint)).toBe(false);
  });

  it("실제 스키마의 답변 FK만 보호하고 선택지 cascade는 유지", () => {
    const answers = getTableConfig(applicationAnswers).foreignKeys;
    const questionFk = answers.find((fk) => fk.reference().columns[0].name === "question_id");
    expect(questionFk?.getName()).toBe(constraint);
    expect(questionFk?.onDelete).toBe("no action");
    expect(answers.find((fk) => fk.reference().columns[0].name === "submission_id")?.onDelete).toBe("cascade");
    expect(getTableConfig(applicationQuestionOptions).foreignKeys[0].onDelete).toBe("cascade");
  });
});
