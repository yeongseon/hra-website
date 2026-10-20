/**
 * 관리자 지원서 편집 페이지의 실제 클라이언트 props를 검증합니다.
 * 기본 설정과 질문 편집에 필요한 필드만 전달하면서 revision·영속 ID·정렬·게시 상태를 보존합니다.
 * 관리자 인가와 UUID 검증은 DB 조회보다 먼저 실행되어야 합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), form: vi.fn(), questions: vi.fn(), cohorts: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.admin }));
vi.mock("@/lib/db", () => ({ db: {
  query: { applicationForms: { findFirst: mocks.form }, applicationQuestions: { findMany: mocks.questions } },
  select: () => ({ from: () => ({ orderBy: mocks.cohorts }) }),
} }));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
// 실제 페이지 JSX를 조사하고 편집 컴포넌트의 저장 액션은 불러오지 않습니다.
vi.mock("@/app/(admin)/admin/application-forms/_components/form-settings", () => ({ FormSettings: () => null }));
vi.mock("@/app/(admin)/admin/application-forms/[id]/_components/form-builder", () => ({ FormBuilder: () => null }));

import AdminApplicationFormDetailPage from "@/app/(admin)/admin/application-forms/[id]/page";
import { FormSettings } from "@/app/(admin)/admin/application-forms/_components/form-settings";
import { FormBuilder } from "@/app/(admin)/admin/application-forms/[id]/_components/form-builder";

const formId = "10000000-0000-4000-8000-000000000001";
const cohortId = "20000000-0000-4000-8000-000000000001";
const params = () => Promise.resolve({ id: formId });

// 현재의 DB 메타와 미래 필드가 편집 props에 자동으로 섞이지 않도록 표식을 넣습니다.
function fixture() {
  return {
    form: { id: formId, title: "합성 지원서", description: null, cohortId, isPublished: false,
      questionsRevision: 17, createdAt: new Date(0), updatedAt: new Date(1), futureField: "양식 내부 값" },
    questions: [{ id: "question-first", formId, title: "첫 질문", description: "선택 안내", type: "CHECKBOX",
      isRequired: true, order: 2, futureField: "질문 내부 값", options: [
        { id: "option-first", questionId: "question-first", value: "첫 선택지", order: 3, futureField: "선택지 내부 값" },
        { id: "option-second", questionId: "question-first", value: "둘째 선택지", order: 9, futureField: "선택지 내부 값" },
      ] },
    { id: "question-second", formId, title: "둘째 질문", description: null, type: "SHORT_ANSWER",
      isRequired: false, order: 8, futureField: "질문 내부 값", options: [] }],
  };
}

// 실제 페이지가 만든 요소를 찾아 선언된 타입과 실제 전달값을 함께 검사합니다.
function findBoundary<Props>(node: ReactNode, component: unknown): ReactElement<Props> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === component && isValidElement<Props>(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = findBoundary<Props>(child, component);
    if (found) return found;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  const data = fixture();
  mocks.admin.mockResolvedValue({ user: { role: "ADMIN" } });
  mocks.form.mockResolvedValue(data.form);
  mocks.questions.mockResolvedValue(data.questions);
  mocks.cohorts.mockResolvedValue([{ id: cohortId, name: "합성 기수" }]);
});

describe("관리자 지원서 편집 props", () => {
  it.each([false, true])("기본 설정은 현재 게시 상태 %s와 편집용 다섯 필드만 받는다", async (isPublished) => {
    const original = { ...fixture().form, isPublished };
    mocks.form.mockResolvedValue(original);
    const page = await AdminApplicationFormDetailPage({ params: params() });
    const settings = findBoundary<ComponentProps<typeof FormSettings>>(page, FormSettings);
    expect(settings).toBeDefined();
    expect(settings?.props).toStrictEqual({
      form: { id: formId, title: "합성 지원서", description: null, cohortId, isPublished },
      cohorts: [{ id: cohortId, name: "합성 기수" }],
    });
    expect(original).toStrictEqual({ ...fixture().form, isPublished });
  });

  it("질문 편집은 revision과 질문·선택지의 ID·현재값·order를 보존하고 연결 메타를 제외한다", async () => {
    const original = fixture();
    mocks.form.mockResolvedValue(original.form);
    mocks.questions.mockResolvedValue(original.questions);
    const page = await AdminApplicationFormDetailPage({ params: params() });
    const builder = findBoundary<ComponentProps<typeof FormBuilder>>(page, FormBuilder);
    expect(builder).toBeDefined();
    expect(builder?.props).toStrictEqual({
      formId, formTitle: "합성 지원서", initialRevision: 17,
      initialQuestions: [{ id: "question-first", title: "첫 질문", description: "선택 안내", type: "CHECKBOX",
        isRequired: true, order: 2, options: [
          { id: "option-first", value: "첫 선택지", order: 3 },
          { id: "option-second", value: "둘째 선택지", order: 9 },
        ] },
      { id: "question-second", title: "둘째 질문", description: null, type: "SHORT_ANSWER",
        isRequired: false, order: 8, options: [] }],
    });
    expect(original).toStrictEqual(fixture());
  });

  it("인가 뒤 기존 양식 필터와 질문·선택지·기수의 SQL 정렬을 유지한다", async () => {
    await AdminApplicationFormDetailPage({ params: params() });
    expect(mocks.admin).toHaveBeenCalledOnce();
    expect(mocks.admin.mock.invocationCallOrder[0]).toBeLessThan(mocks.form.mock.invocationCallOrder[0]);
    const dialect = new PgDialect();
    expect(dialect.sqlToQuery(mocks.form.mock.calls[0][0].where).params).toEqual([formId]);
    const query = mocks.questions.mock.calls[0][0];
    expect(dialect.sqlToQuery(query.where).params).toEqual([formId]);
    expect(query.orderBy).toHaveLength(1);
    expect(dialect.sqlToQuery(query.orderBy[0]).sql).toBe('"application_questions"."order" asc');
    expect(query.with.options.orderBy).toHaveLength(1);
    expect(dialect.sqlToQuery(query.with.options.orderBy[0]).sql).toBe('"application_question_options"."order" asc');
    expect(dialect.sqlToQuery(mocks.cohorts.mock.calls[0][0]).sql).toBe('"cohorts"."order" asc');
  });

  it("관리자 인가가 거부되면 DB를 조회하지 않는다", async () => {
    mocks.admin.mockRejectedValue(new Error("ADMIN_REQUIRED"));
    await expect(AdminApplicationFormDetailPage({ params: params() })).rejects.toThrow("ADMIN_REQUIRED");
    expect(mocks.form).not.toHaveBeenCalled();
    expect(mocks.questions).not.toHaveBeenCalled();
    expect(mocks.cohorts).not.toHaveBeenCalled();
  });

  it("잘못된 ID는 DB 전에, 없는 양식은 질문·기수 조회 전에 404로 종료한다", async () => {
    await expect(AdminApplicationFormDetailPage({ params: Promise.resolve({ id: "invalid" }) })).rejects.toThrow("NOT_FOUND");
    expect(mocks.form).not.toHaveBeenCalled();
    mocks.form.mockResolvedValue(undefined);
    await expect(AdminApplicationFormDetailPage({ params: params() })).rejects.toThrow("NOT_FOUND");
    expect(mocks.questions).not.toHaveBeenCalled();
    expect(mocks.cohorts).not.toHaveBeenCalled();
  });
});
