/**
 * #97 지원서 제출 액션의 원자적 배치와 응답 유실 복구를 검증한다.
 * 실제 DB 경합은 별도 격리 PostgreSQL 테스트에서 확인한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
    }],
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
    mocks.batch.mockResolvedValue([]);
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
