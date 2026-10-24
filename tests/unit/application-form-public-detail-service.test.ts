/**
 * 공개 지원 양식 상세 Service의 UUID·비공개 정책과 최소 표시 DTO를 검증합니다.
 * 실제 DB 투영과 정렬은 격리 PostgreSQL 테스트에서 확인합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ form: vi.fn(), questions: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/applications/public-detail/repository", () => ({
  findPublicApplicationFormRow: mocks.form,
  findPublicApplicationQuestionRows: mocks.questions,
}));

import { getPublicApplicationFormDetail } from "@/features/applications/public-detail/service";

const formId = "11111111-1111-4111-8111-111111111111";
const form = { id: formId, title: "합성 지원서", description: "공개 안내", isPublished: true, cohortId: "internal-cohort", questionsRevision: 23 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.form.mockResolvedValue(undefined);
  mocks.questions.mockResolvedValue([]);
});

describe("공개 지원 양식 상세 서비스", () => {
  it("잘못된 UUID는 저장소 조회 전에 invalid로 종료한다", async () => {
    expect(await getPublicApplicationFormDetail("invalid")).toEqual({ kind: "invalid" });
    expect(mocks.form).not.toHaveBeenCalled();
    expect(mocks.questions).not.toHaveBeenCalled();
  });

  it("없는 양식과 비공개 양식은 같은 결과를 내고 질문을 조회하지 않는다", async () => {
    expect(await getPublicApplicationFormDetail(formId)).toEqual({ kind: "unavailable" });
    mocks.form.mockResolvedValueOnce({ ...form, isPublished: false });
    expect(await getPublicApplicationFormDetail(formId)).toEqual({ kind: "unavailable" });
    expect(mocks.form).toHaveBeenCalledTimes(2);
    expect(mocks.questions).not.toHaveBeenCalled();
  });

  it("공개 양식만 질문을 조회하고 내부 행 열을 새 DTO에 복사하지 않는다", async () => {
    mocks.form.mockResolvedValue(form);
    mocks.questions.mockResolvedValue([{
      id: "question-1", title: "첫 질문", description: "힌트", type: "CHECKBOX", isRequired: true,
      formId, order: 2, internalSentinel: "secret-question",
      options: [{ id: "option-2", value: "나", order: 3, questionId: "question-1", internalSentinel: "secret-option" },
        { id: "option-1", value: "가", order: 9, questionId: "question-1" }],
    }]);
    const result = await getPublicApplicationFormDetail(formId);
    expect(mocks.form).toHaveBeenCalledExactlyOnceWith(formId);
    expect(mocks.questions).toHaveBeenCalledExactlyOnceWith(formId);
    expect(result).toStrictEqual({
      kind: "published",
      form: { id: formId, title: "합성 지원서", description: "공개 안내" },
      questions: [{
        id: "question-1", title: "첫 질문", description: "힌트", type: "CHECKBOX", isRequired: true,
        options: [{ id: "option-2", value: "나" }, { id: "option-1", value: "가" }],
      }],
    });
    expect(JSON.stringify(result)).not.toMatch(/internal-cohort|questionsRevision|secret-question|secret-option|questionId/);
  });

  it("마스터와 질문 DB 실패를 비가용 화면으로 숨기지 않는다", async () => {
    const failure = new Error("합성 DB 오류");
    mocks.form.mockRejectedValueOnce(failure);
    await expect(getPublicApplicationFormDetail(formId)).rejects.toBe(failure);
    mocks.form.mockResolvedValueOnce(form);
    mocks.questions.mockRejectedValueOnce(failure);
    await expect(getPublicApplicationFormDetail(formId)).rejects.toBe(failure);
  });
});
