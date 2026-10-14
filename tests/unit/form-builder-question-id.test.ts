/**
 * #113 새 질문을 저장한 뒤 같은 화면에서 다시 수정해도 서버가 부여한 ID를 사용합니다.
 * 질문 초기 목록을 정렬할 때 부모의 배열을 바꾸지 않는지도 확인합니다.
 */
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  refresh: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));
vi.mock("@/features/applications/actions/questions", () => ({ saveFormQuestions: mocks.save }));

import { FormBuilder } from "@/app/(admin)/admin/application-forms/[id]/_components/form-builder";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe("질문 빌더의 저장 ID", () => {
  it("추가 → 저장 → 수정 → 저장 과정에서 같은 질문 ID와 새 버전을 전송한다", async () => {
    const id = "22222222-2222-4222-8222-222222222222";
    mocks.save
      .mockResolvedValueOnce({ success: true, message: "저장됨", revision: 1, questionIds: [id] })
      .mockResolvedValueOnce({ success: true, message: "저장됨", revision: 2, questionIds: [id] });

    render(createElement(FormBuilder, {
      formId: "11111111-1111-4111-8111-111111111111",
      initialRevision: 0,
      initialQuestions: [],
    }));
    fireEvent.click(screen.getByRole("button", { name: "질문 추가하기" }));
    fireEvent.change(screen.getByPlaceholderText("질문 내용을 입력하세요"), { target: { value: "처음 질문" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "전체 질문 저장하기" })));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][1][0]).toMatchObject({ title: "처음 질문" });
    expect(mocks.save.mock.calls[0][1][0].id).toBeUndefined();
    expect(mocks.save.mock.calls[0][2]).toBe(0);

    fireEvent.change(screen.getByPlaceholderText("질문 내용을 입력하세요"), { target: { value: "수정 질문" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "전체 질문 저장하기" })));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(2));
    expect(mocks.save.mock.calls[1][1][0]).toMatchObject({ id, title: "수정 질문" });
    expect(mocks.save.mock.calls[1][2]).toBe(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("초기 질문 정렬은 부모가 전달한 배열을 변경하지 않는다", () => {
    const first = {
      id: "33333333-3333-4333-8333-333333333333",
      title: "두 번째 질문",
      description: null,
      type: "SHORT_ANSWER" as const,
      isRequired: false,
      order: 1,
      options: [],
    };
    const second = { ...first, id: "44444444-4444-4444-8444-444444444444", title: "첫 번째 질문", order: 0 };
    const initialQuestions = [first, second];
    render(createElement(FormBuilder, {
      formId: "11111111-1111-4111-8111-111111111111",
      initialRevision: 0,
      initialQuestions,
    }));
    expect(initialQuestions).toEqual([first, second]);
    expect(screen.getAllByPlaceholderText("질문 내용을 입력하세요").map((input) =>
      (input as HTMLInputElement).value)).toEqual(["첫 번째 질문", "두 번째 질문"]);
  });
});
