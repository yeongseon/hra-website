/**
 * 공개 지원서 페이지의 서버 → 클라이언트 props 경계를 검증합니다.
 * 실제 페이지가 반환한 JSX를 조사하여 DB 내부 필드의 전달을 막고,
 * 질문·선택지 표시 순서와 비공개 양식의 조기 종료를 보존합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findForm: vi.fn(),
  findQuestions: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: { query: {
    applicationForms: { findFirst: mocks.findForm },
    applicationQuestions: { findMany: mocks.findQuestions },
  } },
}));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NOT_FOUND"); },
}));
// 페이지의 JSX 경계만 조사하고 클라이언트의 저장 액션은 불러오지 않습니다.
vi.mock("@/app/(public)/recruitment/apply/[id]/_components/public-application-form", () => ({
  PublicApplicationForm: () => null,
}));

import PublicApplicationApplyPage, { dynamic } from "@/app/(public)/recruitment/apply/[id]/page";
import { PublicApplicationForm } from "@/app/(public)/recruitment/apply/[id]/_components/public-application-form";

type PublicFormProps = ComponentProps<typeof PublicApplicationForm>;
const formId = "11111111-1111-4111-8111-111111111111";
const params = () => Promise.resolve({ id: formId });

/** 실제 페이지의 JSX 트리에서 클라이언트 경계의 props를 찾습니다. */
function findPublicForm(node: ReactNode): ReactElement<PublicFormProps> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return;
  if (node.type === PublicApplicationForm && isValidElement<PublicFormProps>(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findPublicForm(child);
    if (found) return found;
  }
}

/** 미래에 DB 필드가 늘어도 클라이언트 계약이 자동 확장되지 않도록 표식을 넣습니다. */
function fixture() {
  const form = {
    id: formId, title: "모집 지원서", description: "지원 안내",
    cohortId: "internal-cohort", isPublished: true, questionsRevision: 17,
    createdAt: new Date(0), updatedAt: new Date(1), internalSentinel: "form-internal",
  };
  const questions = [{
    id: "question-first", formId, title: "첫 질문", description: "선택 안내",
    type: "CHECKBOX", isRequired: true, order: 2, internalSentinel: "question-internal",
    options: [
      { id: "option-b", questionId: "question-first", value: "나", order: 3, internalSentinel: "option-internal" },
      { id: "option-a", questionId: "question-first", value: "가", order: 9, internalSentinel: "option-internal" },
    ],
  }, {
    id: "question-second", formId, title: "둘째 질문", description: null,
    type: "SHORT_ANSWER", isRequired: false, order: 8, internalSentinel: "question-internal",
    options: [],
  }];
  return { form, questions };
}

describe("공개 지원서 페이지의 클라이언트 props", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const { form, questions } = fixture();
    mocks.findForm.mockResolvedValue(form);
    mocks.findQuestions.mockResolvedValue(questions);
  });

  it("필요한 내용·식별자·조회 순서만 보존하고 DB 내부 필드를 전달하지 않는다", async () => {
    const original = fixture();
    mocks.findForm.mockResolvedValue(original.form);
    mocks.findQuestions.mockResolvedValue(original.questions);

    const boundary = findPublicForm(await PublicApplicationApplyPage({ params: params() }));
    expect(boundary).toBeDefined();
    expect(boundary?.props).toStrictEqual({
      form: { id: formId, title: "모집 지원서", description: "지원 안내" },
      questions: [{
        id: "question-first", title: "첫 질문", description: "선택 안내",
        type: "CHECKBOX", isRequired: true,
        options: [{ id: "option-b", value: "나" }, { id: "option-a", value: "가" }],
      }, {
        id: "question-second", title: "둘째 질문", description: null,
        type: "SHORT_ANSWER", isRequired: false, options: [],
      }],
    });
    expect(original).toStrictEqual(fixture());
  });

  it("질문과 선택지는 DB에서 기존 오름차순으로 조회한다", async () => {
    await PublicApplicationApplyPage({ params: params() });
    const query = mocks.findQuestions.mock.calls[0][0];
    const dialect = new PgDialect();
    expect(query.orderBy).toHaveLength(1);
    expect(dialect.sqlToQuery(query.orderBy[0]).sql).toBe('"application_questions"."order" asc');
    expect(query.with.options.orderBy).toHaveLength(1);
    expect(dialect.sqlToQuery(query.with.options.orderBy[0]).sql).toBe('"application_question_options"."order" asc');
  });

  it.each(["비공개", "없는"])("%s 양식은 질문 조회나 클라이언트 폼 없이 종료한다", async (state) => {
    mocks.findForm.mockResolvedValue(state === "비공개" ? { ...fixture().form, isPublished: false } : undefined);
    expect(findPublicForm(await PublicApplicationApplyPage({ params: params() }))).toBeUndefined();
    expect(mocks.findQuestions).not.toHaveBeenCalled();
  });

  it("잘못된 경로 ID는 DB 조회 전에 404로 종료한다", async () => {
    await expect(PublicApplicationApplyPage({ params: Promise.resolve({ id: "invalid" }) }))
      .rejects.toThrow("NOT_FOUND");
    expect(mocks.findForm).not.toHaveBeenCalled();
    expect(mocks.findQuestions).not.toHaveBeenCalled();
  });

  it("없는 양식과 비공개 양식은 동일한 200 마감 안내 화면을 표시한다", async () => {
    expect(dynamic).toBe("force-dynamic");
    mocks.findForm.mockResolvedValueOnce({ ...fixture().form, isPublished: false });
    const privateHtml = renderToStaticMarkup(await PublicApplicationApplyPage({ params: params() }));
    mocks.findForm.mockResolvedValueOnce(undefined);
    const missingHtml = renderToStaticMarkup(await PublicApplicationApplyPage({ params: params() }));
    expect(privateHtml).toBe(missingHtml);
    expect(privateHtml).toContain("모집이 마감되었습니다");
    expect(privateHtml).toContain('href="/"');
    expect(mocks.findQuestions).not.toHaveBeenCalled();
  });

  it("마스터 또는 질문 DB 오류는 마감 화면으로 숨기지 않고 상위 경계로 전달한다", async () => {
    const failure = new Error("합성 상세 DB 오류");
    mocks.findForm.mockRejectedValueOnce(failure);
    await expect(PublicApplicationApplyPage({ params: params() })).rejects.toBe(failure);
    expect(mocks.findQuestions).not.toHaveBeenCalled();

    mocks.findForm.mockResolvedValueOnce(fixture().form);
    mocks.findQuestions.mockRejectedValueOnce(failure);
    await expect(PublicApplicationApplyPage({ params: params() })).rejects.toBe(failure);
  });
});
