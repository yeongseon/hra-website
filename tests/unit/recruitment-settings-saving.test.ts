/**
 * 모집 설정 저장 중에는 동일한 저장 버튼이 비활성화되어 중복 요청을 막습니다 (#130).
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCohorts: vi.fn(),
  getRecruitmentSettings: vi.fn(),
  updateRecruitmentInfo: vi.fn(),
  updateRecruitmentPoster: vi.fn(),
  updateRecruitmentDetails: vi.fn(),
}));

vi.mock("@/components/admin/rich-text-editor", () => ({ RichTextEditor: () => null }));
vi.mock("@/features/recruitment-settings/actions", () => ({
  getCohorts: mocks.getCohorts,
  getRecruitmentSettings: mocks.getRecruitmentSettings,
  updateRecruitmentInfo: mocks.updateRecruitmentInfo,
  updateRecruitmentPoster: mocks.updateRecruitmentPoster,
  updateRecruitmentDetails: mocks.updateRecruitmentDetails,
}));

import { RecruitmentSettingsClient } from "@/app/(admin)/admin/recruitment-settings/_components/recruitment-settings-client";

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

describe("모집 설정 저장", () => {
  it("서버 응답이 올 때까지 저장 버튼을 잠근다", async () => {
    mocks.getCohorts.mockResolvedValue([]);
    mocks.getRecruitmentSettings.mockResolvedValue(null);
    let finishSave: ((value: { success: boolean; message: string }) => void) | undefined;
    mocks.updateRecruitmentInfo.mockReturnValue(new Promise((resolve) => { finishSave = resolve; }));

    render(createElement(RecruitmentSettingsClient));
    await waitFor(() => expect(mocks.getRecruitmentSettings).toHaveBeenCalled());

    const saveButton = screen.getAllByRole("button", { name: "저장" })[0];
    fireEvent.click(saveButton);
    await waitFor(() => expect(saveButton).toHaveProperty("disabled", true));
    fireEvent.click(saveButton);
    expect(mocks.updateRecruitmentInfo).toHaveBeenCalledTimes(1);

    finishSave?.({ success: true, message: "저장했습니다." });
    await waitFor(() => expect(saveButton).toHaveProperty("disabled", false));
  });
});
