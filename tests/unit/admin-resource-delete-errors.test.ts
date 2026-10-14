/**
 * 관리자 자료 삭제가 실패하면 대화상자 안에 서버 오류를 표시합니다 (#130).
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deleteClassLog: vi.fn(),
  deleteWeeklyText: vi.fn(),
  deleteClassMaterial: vi.fn(),
  deleteGuidebook: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/class-logs/actions", () => ({ deleteClassLog: mocks.deleteClassLog }));
vi.mock("@/features/weekly-texts/actions", () => ({ deleteWeeklyText: mocks.deleteWeeklyText }));
vi.mock("@/features/class-materials/actions", () => ({ deleteClassMaterial: mocks.deleteClassMaterial }));
vi.mock("@/features/guidebooks/actions", () => ({ deleteGuidebook: mocks.deleteGuidebook }));

import { ClassLogRowActions } from "@/app/(admin)/admin/resources/_components/class-log-row-actions";
import { WeeklyTextRowActions } from "@/app/(admin)/admin/resources/weekly-texts/_components/weekly-text-row-actions";
import { ClassMaterialRowActions } from "@/app/(admin)/admin/resources/class-materials/_components/class-material-row-actions";
import { GuidebookRowActions } from "@/app/(admin)/admin/resources/guidebooks/_components/guidebook-row-actions";

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("관리자 자료 삭제 실패", () => {
  it.each([
    { title: "수업일지", component: ClassLogRowActions, action: mocks.deleteClassLog },
    { title: "주차별 텍스트", component: WeeklyTextRowActions, action: mocks.deleteWeeklyText },
    { title: "강의 자료", component: ClassMaterialRowActions, action: mocks.deleteClassMaterial },
    { title: "가이드북", component: GuidebookRowActions, action: mocks.deleteGuidebook },
  ])("$title 삭제 오류를 사용자에게 표시한다", async ({ component, action }) => {
    action.mockResolvedValue({ success: false, error: "삭제 권한이 없습니다." });
    render(createElement(component, { id: "11111111-1111-4111-8111-111111111111" }));

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    fireEvent.click(screen.getAllByRole("button", { name: "삭제" }).at(-1)!);

    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("삭제 권한이 없습니다."));
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});
