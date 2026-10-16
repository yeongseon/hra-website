/** 학생 등록 입력이 동명이인·계정 연결을 추정하지 않고 명시적인 기존 식별자만 허용하는지 검증한다. */
import { describe, expect, it } from "vitest";
import { rosterInputSchema } from "@/features/academics/roster/input";
import { rosterErrorMessage } from "@/lib/db/academic-roster";
const id = "10000000-0000-4000-8000-000000000001";
const input = { requestId: id, cohortId: id, studentId: "", displayName: "학생 가", verificationMethod: "IN_PERSON", evidenceReference: id };

describe("학생 명부 입력", () => {
  it("신규 학생 이름을 정규화하고 같은 이름 입력 자체는 거부하지 않는다", () => {
    expect(rosterInputSchema.parse({ ...input, displayName: " 학생 가 " }).displayName).toBe("학생 가");
    expect(rosterInputSchema.safeParse(input).success).toBe(true);
  });
  it("기존 학생은 UUID만 지정하며 이름 수정 입력을 거부한다", () => {
    expect(rosterInputSchema.safeParse({ ...input, studentId: id, displayName: "" }).success).toBe(true);
    expect(rosterInputSchema.safeParse({ ...input, studentId: id }).success).toBe(false);
  });
  it.each([
    { displayName: "  " }, { displayName: "가".repeat(101) }, { studentId: "학생 가", displayName: "" },
    { requestId: "" }, { evidenceReference: "연락처 원문" }, { cohortId: "" }, { verificationMethod: "EMAIL_MATCH" },
  ])("부적절한 입력을 거부한다: %j", change => {
    expect(rosterInputSchema.safeParse({ ...input, ...change }).success).toBe(false);
  });
  it("정확한 SQLSTATE·제약 이름의 중복등록만 인식하고 원문은 표시하지 않는다", () => {
    const original = { code: "23505", constraint: "cohort_enrollments_student_cohort_unique",
      message: "중복 키: 비공개 시험 이름", detail: "private-fixture@example.invalid" };
    expect(rosterErrorMessage(new Error("쿼리 실패", { cause: original }))).toBe("이미 해당 기수에 등록된 학생입니다.");
    expect(rosterErrorMessage(original)).not.toContain("비공개");
    expect(rosterErrorMessage(original)).not.toContain("private-fixture");
  });
  it.each([
    ["roster_missing_cohort", "선택한 기수를 찾을 수 없습니다."],
    ["roster_missing_student", "기존 학생을 찾을 수 없습니다. 학생 식별자를 확인해 주세요."],
    ["roster_request_conflict", "같은 요청 식별자로 다른 등록을 요청할 수 없습니다. 등록 화면을 다시 열어 주세요."],
  ])("SQL 함수의 고정 예외 %s만 정확히 인식한다", (message, expected) => {
    const original = Object.assign(new Error(message), { code: "P0001", detail: "비공개 시험 증빙" });
    expect(rosterErrorMessage(new Error("비공개 시험 쿼리", { cause: original }))).toBe(expected);
    expect(rosterErrorMessage({ code: "P0001", message })).toBe(expected);
  });
  it.each([
    new Error("cohort_enrollments_student_cohort_unique 비공개 시험 이름"),
    { code: "23503", constraint: "cohort_enrollments_student_cohort_unique" },
    { code: "23505", constraint: "다른 제약", message: "cohort_enrollments_student_cohort_unique" },
    { code: "P0001", message: "비공개 시험 이름 roster_missing_cohort" },
    { code: "P0001", message: "알 수 없는 오류", detail: "roster_missing_cohort" },
    { code: "23505", message: "roster_missing_cohort" },
    { message: "roster_missing_cohort" },
    { code: "P0001", message: "toString" },
  ])("원문에 기계 코드가 포함되어도 안전한 일반 안내를 제공한다: %j", error => {
    expect(rosterErrorMessage(error)).toBe("학생 등록을 완료하지 못했습니다. 입력 내용과 서비스 상태를 확인해 주세요.");
  });
  it("순환 cause도 원문 노출이나 무한 순회 없이 처리한다", () => {
    const error: { cause?: unknown; message: string } = { message: "비공개 시험 원문" };
    error.cause = error;
    expect(rosterErrorMessage(error)).not.toContain("비공개");
  });
});
