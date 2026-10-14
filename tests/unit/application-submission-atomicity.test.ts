/**
 * #97 지원서 제출 액션의 원자적 배치와 응답 유실 복구를 검증한다.
 * 실제 DB 경합은 별도 격리 PostgreSQL 테스트에서 확인한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applicationInputLimits } from "@/features/applications/input-limits";

type MockQuestion = {
  id: string;
  title: string;
  type: "SHORT_ANSWER" | "LONG_ANSWER" | "MULTIPLE_CHOICE" | "CHECKBOX" | "DROPDOWN";
  isRequired: boolean;
  options: { value: string }[];
};

const defaultQuestion: MockQuestion = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "지원 동기",
  type: "SHORT_ANSWER",
  isRequired: true,
  options: [],
};

const mocks = vi.hoisted(() => ({
  batch: vi.fn(),
  insertValues: vi.fn(),
  revalidatePath: vi.fn(),
  logServerError: vi.fn(),
  persisted: false,
  form: {
    title: "지원서",
    isPublished: true,
    questionsRevision: 0,
    questions: [{
      id: "22222222-2222-4222-8222-222222222222",
      title: "지원 동기",
      type: "SHORT_ANSWER",
      isRequired: true,
      options: [],
    }] as MockQuestion[],
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: vi.fn() }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.logServerError }));
vi.mock("@/lib/rate-limit", () => ({
  checkApplicationSubmissionHourlyLimit: async () => ({ blocked: false }),
}));
vi.mock("@/lib/rate-limit-core", () => ({ extractClientIp: () => "127.0.0.1" }));
vi.mock("@/lib/db", () => ({
  db: {
    query: {
      applicationForms: { findFirst: async () => mocks.form },
      applicationSubmissions: { findMany: async () => [{
        applicantName: "지원자",
        applicantEmail: "applicant@example.com",
        applicantPhone: "010-0000-0000",
        submittedAt: new Date("2026-10-14T00:00:00Z"),
        status: "PENDING",
        answers: [{ questionId: "22222222-2222-4222-8222-222222222222", value: "지원 동기 내용" }],
      }] },
    },
    select: () => ({
      from: () => ({
        where: () => ({
          then: (resolve: (value: unknown) => void) => Promise.resolve([{ c: 0 }]).then(resolve),
          limit: () => Promise.resolve(mocks.persisted ? [{ id: "committed" }] : []),
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        mocks.insertValues(table, values);
        return {
          table,
          values,
          then: (resolve: (value: unknown) => void) => Promise.resolve([]).then(resolve),
        };
      },
    }),
    batch: mocks.batch,
    execute: () => ({ kind: "revision-check" }),
  },
}));

import { exportSubmissionsToCsv, submitApplicationForm } from "@/features/applications/actions/submissions";

function submission() {
  const data = new FormData();
  data.set("formId", "11111111-1111-4111-8111-111111111111");
  data.set("applicantName", "지원자");
  data.set("applicantEmail", "applicant@example.com");
  data.set("applicantPhone", "010-0000-0000");
  data.set("q-22222222-2222-4222-8222-222222222222", "지원 동기 내용");
  return data;
}

describe("지원서 제출 배치 (#97)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.persisted = false;
    mocks.form.isPublished = true;
    mocks.form.questions = [{ ...defaultQuestion, options: [] }];
    mocks.batch.mockResolvedValue([]);
  });

  it("비공개 양식은 일정과 무관하게 서버 제출을 거부한다 (#104)", async () => {
    mocks.form.isPublished = false;
    const result = await submitApplicationForm({ success: false, message: "" }, submission());
    expect(result).toEqual({ success: false, message: "현재 접수 가능한 지원서가 아닙니다." });
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it.each([
    ["applicantName", "가".repeat(applicationInputLimits.applicantName),
      "가".repeat(applicationInputLimits.applicantName + 1), "이름은 100자 이하여야 합니다."],
    ["applicantEmail", `${"a".repeat(243)}@example.com`,
      `${"a".repeat(244)}@example.com`, "이메일 주소는 255자 이하여야 합니다."],
    ["applicantPhone", "1".repeat(applicationInputLimits.applicantPhone),
      "1".repeat(applicationInputLimits.applicantPhone + 1), "연락처는 20자 이하여야 합니다."],
  ] as const)("%s은 DB 길이까지 허용하고 초과 입력은 저장하지 않는다", async (field, atLimit, tooLong, message) => {
    const data = submission();
    data.set(field, atLimit);
    expect((await submitApplicationForm({ success: false, message: "" }, data)).success).toBe(true);
    mocks.batch.mockClear();

    data.set(field, tooLong);
    expect(await submitApplicationForm({ success: false, message: "" }, data))
      .toEqual({ success: false, message });
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it.each([
    ["SHORT_ANSWER", applicationInputLimits.shortAnswer],
    ["LONG_ANSWER", applicationInputLimits.longAnswer],
  ] as const)("%s 답변은 %i자까지 받고 초과하면 거부한다", async (type, maxLength) => {
    mocks.form.questions = [{ ...defaultQuestion, type, options: [] }];
    const data = submission();
    data.set(`q-${defaultQuestion.id}`, "가".repeat(maxLength));
    expect((await submitApplicationForm({ success: false, message: "" }, data)).success).toBe(true);
    mocks.batch.mockClear();

    data.set(`q-${defaultQuestion.id}`, "가".repeat(maxLength + 1));
    expect(await submitApplicationForm({ success: false, message: "" }, data)).toEqual({
      success: false,
      message: `[지원 동기] 답변은 ${maxLength}자 이하여야 합니다.`,
    });
    expect(mocks.batch).not.toHaveBeenCalled();
  });

  it("공백만 있는 필수 답변은 거부하고 체크박스 중복 선택은 한 번만 저장한다", async () => {
    const data = submission();
    data.set(`q-${defaultQuestion.id}`, "   ");
    expect(await submitApplicationForm({ success: false, message: "" }, data)).toEqual({
      success: false,
      message: "[지원 동기] 항목은 필수입니다.",
    });
    expect(mocks.batch).not.toHaveBeenCalled();

    mocks.form.questions = [{ ...defaultQuestion, type: "CHECKBOX", options: [{ value: "선택 1" }, { value: "선택 2" }] }];
    data.delete(`q-${defaultQuestion.id}`);
    data.append(`q-${defaultQuestion.id}`, "선택 1");
    data.append(`q-${defaultQuestion.id}`, "선택 1");
    data.append(`q-${defaultQuestion.id}`, "선택 2");
    expect((await submitApplicationForm({ success: false, message: "" }, data)).success).toBe(true);
    const answers = mocks.insertValues.mock.calls.find(([, values]) => Array.isArray(values));
    expect(answers?.[1]).toEqual([expect.objectContaining({ value: '["선택 1","선택 2"]' })]);
  });

  it("답변 INSERT 실패는 실패로 응답하고 같은 이메일 재시도를 허용한다", async () => {
    mocks.batch.mockRejectedValueOnce(new Error("answer insert failed"));
    const failed = await submitApplicationForm({ success: false, message: "" }, submission());
    expect(failed.success).toBe(false);
    expect(mocks.batch).toHaveBeenCalledTimes(1);
    expect(mocks.batch.mock.calls[0][0]).toHaveLength(3);

    const retried = await submitApplicationForm({ success: false, message: "" }, submission());
    expect(retried.success).toBe(true);
    expect(mocks.batch).toHaveBeenCalledTimes(2);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("동일 이메일 UNIQUE 충돌을 기존 중복 제출 안내로 반환한다", async () => {
    mocks.batch.mockRejectedValueOnce({
      cause: { code: "23505", constraint: "application_submissions_form_applicant_unique" },
    });
    const result = await submitApplicationForm({ success: false, message: "" }, submission());
    expect(result).toEqual({ success: false, message: "이미 같은 이메일로 이 지원서를 제출하셨습니다." });
    expect(mocks.logServerError).not.toHaveBeenCalled();
  });

  it("배치 커밋 뒤 응답만 유실되면 요청 ID 조회로 성공을 확정한다", async () => {
    mocks.persisted = true;
    mocks.batch.mockRejectedValueOnce(new Error("connection lost"));
    const result = await submitApplicationForm({ success: false, message: "" }, submission());
    expect(result.success).toBe(true);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(1);
  });

  it("읽은 뒤 질문 버전이 바뀌면 제출을 거부한다", async () => {
    mocks.batch.mockRejectedValueOnce({
      cause: { code: "P0001", message: "application_form_questions_stale" },
    });
    const result = await submitApplicationForm({ success: false, message: "" }, submission());
    expect(result).toEqual({ success: false, message: "지원서가 변경되었습니다. 새로고침 후 다시 제출해주세요." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("관리자 CSV는 보존된 질문 제목 아래에 과거 답변을 표시한다", async () => {
    const result = await exportSubmissionsToCsv("11111111-1111-4111-8111-111111111111");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toContain('"지원 동기"');
      expect(result.data).toContain('"지원 동기 내용"');
    }
  });
});
