/** #193 기수 삭제가 거절되면 관리자 대화상자에 한국어 이유를 남깁니다. */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteCohort: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/recruitment/actions", () => ({ deleteCohort: mocks.deleteCohort }));

import { RecruitmentRowActions } from "@/app/(admin)/admin/recruitment/_components/recruitment-row-actions";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("기수 삭제 오류 안내", () => {
  it("지원서가 연결된 기수의 삭제 실패를 표시하고 대화상자를 유지한다", async () => {
    mocks.deleteCohort.mockResolvedValue({ success: false, message: "지원서가 연결된 기수는 삭제할 수 없습니다." });
    render(createElement(RecruitmentRowActions, { id: "11111111-1111-4111-8111-111111111111" }));
    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("지원서가 연결된 기수는 삭제할 수 없습니다."));
    expect(screen.getByText("기수를 삭제할까요?")).toBeTruthy();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
