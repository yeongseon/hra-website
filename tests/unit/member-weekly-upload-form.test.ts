/**
 * #116 성공 상태가 남아 있어도 새로고침·폼 초기화는 업로드 한 번마다 한 번만 실행합니다.
 * 첫 업로드 뒤 다음 제목을 유지하고 같은 화면에서 다시 업로드할 수 있는지 확인합니다.
 */
import { createElement } from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const refresh = vi.fn();
  return { refresh, router: { refresh } };
});

vi.mock("next/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("@/components/admin/markdown-editor", () => ({ MarkdownEditor: () => null }));
vi.mock("@/lib/resource-upload-client", () => ({ prepareResourceUpload: async (formData: FormData) => ({ formData }) }));

import { MemberUploadForm } from "@/app/(member)/resources/weekly-texts/_components/member-upload-form";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  mocks.refresh.mockReset();
});

describe("회원 주차별 텍스트 연속 업로드", () => {
  it("성공마다 한 번만 초기화·새로고침하고 두 번째 입력을 유지한다", async () => {
    const action = vi.fn<(formData: FormData) => Promise<{ success: boolean }>>()
      .mockImplementation(async () => ({ success: true }));
    const { container } = render(createElement(MemberUploadForm, {
      action,
      cohorts: [{ id: "11111111-1111-4111-8111-111111111111", name: "20기" }],
      userCohortId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
    }));
    const form = container.querySelector("form");
    const title = container.querySelector<HTMLInputElement>('input[name="title"]');
    const file = container.querySelector<HTMLInputElement>('input[name="file"]');
    if (!form || !title || !file) throw new Error("업로드 입력을 찾을 수 없습니다.");

    fireEvent.change(title, { target: { value: "첫 자료" } });
    fireEvent.change(file, { target: { files: [new File(["PDF"], "first.pdf", { type: "application/pdf" })] } });
    await act(async () => fireEvent.submit(form));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(1));

    fireEvent.change(title, { target: { value: "두 번째 자료" } });
    expect(title.value).toBe("두 번째 자료");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);

    fireEvent.change(file, { target: { files: [new File(["PDF"], "second.pdf", { type: "application/pdf" })] } });
    await act(async () => fireEvent.submit(form));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledTimes(2));
    expect(action.mock.calls[1]?.[0]?.get("title")).toBe("두 번째 자료");
  });
});
