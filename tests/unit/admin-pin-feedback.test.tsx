/**
 * 공지·수료생 고정 버튼의 실제 클릭으로 서버 실패 안내와 재시도를 검증한다.
 * 성공한 명령에서만 목록을 갱신하고, 통신 예외 원문을 노출하지 않아야 한다.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ notice: vi.fn(), alumni: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/features/notices/actions", () => ({ togglePin: mocks.notice }));
vi.mock("@/features/alumni/actions", () => ({ toggleAlumniPin: mocks.alumni }));

import { NoticePinButton } from "@/app/(admin)/admin/notices/_components/notice-pin-button";
import { AlumniPinButton } from "@/app/(admin)/admin/alumni/_components/alumni-pin-button";

const id = "10000000-0000-4000-8000-000000000001";
const cases = [
  { name: "공지", Component: NoticePinButton, action: mocks.notice, missing: "공지사항을 찾을 수 없습니다." },
  { name: "수료생", Component: AlumniPinButton, action: mocks.alumni, missing: "수료생 이야기를 찾을 수 없습니다." },
];

beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe.each(cases)("$name 고정 버튼의 실패 안내", ({ Component, action, missing }) => {
  it("실패를 알리고 재시도를 허용하며 성공한 요청에서만 목록을 갱신한다", async () => {
    action.mockResolvedValueOnce({ success: false, message: missing })
      .mockResolvedValueOnce({ success: true, message: "고정했습니다." });
    render(<Component id={id} pinned={false} />);

    fireEvent.click(screen.getByRole("button", { name: "상단 고정" }));
    expect((await screen.findByRole("alert")).textContent).toBe(missing);
    expect(action).toHaveBeenCalledWith(id);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "상단 고정" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(action).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("고정했습니다.")).toBeNull();
  });

  it("처리 중에는 다른 반전 명령을 보내지 않는다", async () => {
    let finish: ((result: { success: boolean; message: string }) => void) | undefined;
    action.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<Component id={id} pinned />);

    fireEvent.click(screen.getByRole("button", { name: "고정 해제" }));
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button"));
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => { finish?.({ success: false, message: missing }); });
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });

  it("통신 예외는 안전한 한국어 안내로 표시하고 목록 갱신을 실행하지 않는다", async () => {
    action.mockRejectedValueOnce(new Error("private@example.test UPDATE notices SET pinned"));
    render(<Component id={id} pinned={false} />);

    fireEvent.click(screen.getByRole("button", { name: "상단 고정" }));
    expect((await screen.findByRole("alert")).textContent)
      .toBe("고정 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.");
    expect(document.body.textContent).not.toMatch(/private@example|UPDATE|notices/);
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button").hasAttribute("disabled")).toBe(false);
  });
});
