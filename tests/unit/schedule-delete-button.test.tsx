/**
 * 관리자 일정 삭제 폼을 실제로 제출해 사용자에게 전달되는 실패 안내를 검증한다.
 * 서버의 참조 거부 후 재시도, 처리 중 중복 제출 차단, 통신 예외의 안전한 안내를 확인한다.
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleActionState } from "@/features/schedule/actions";

const mocks = vi.hoisted(() => ({ deleteScheduleEvent: vi.fn() }));
vi.mock("@/features/schedule/actions", () => ({ deleteScheduleEvent: mocks.deleteScheduleEvent }));

import { ScheduleDeleteButton } from "@/app/(admin)/admin/schedule/_components/schedule-delete-button";

const eventId = "50000000-0000-4000-8000-000000000001";
const referenceMessage = "과제에 연결된 일정이나 세션은 삭제할 수 없습니다. 연결된 과제를 확인해주세요.";

beforeEach(() => vi.resetAllMocks());
afterEach(() => cleanup());

describe("일정 삭제 결과 안내", () => {
  it("서버의 한국어 실패 이유를 표시하고 같은 일정 삭제를 다시 시도할 수 있다", async () => {
    mocks.deleteScheduleEvent
      .mockResolvedValueOnce({ success: false, message: referenceMessage })
      .mockResolvedValueOnce({ success: true, message: "일정이 삭제되었습니다." });
    render(<ScheduleDeleteButton id={eventId} />);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect((await screen.findByRole("alert")).textContent).toBe(referenceMessage);
    expect(mocks.deleteScheduleEvent).toHaveBeenCalledWith(eventId);
    expect(screen.getByRole("button", { name: "삭제" }).hasAttribute("disabled")).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(mocks.deleteScheduleEvent).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });

  it("삭제 응답을 기다리는 동안 버튼을 비활성화하고 완료 후 다시 활성화한다", async () => {
    let finish: ((result: ScheduleActionState) => void) | undefined;
    mocks.deleteScheduleEvent.mockReturnValueOnce(new Promise<ScheduleActionState>(resolve => { finish = resolve; }));
    render(<ScheduleDeleteButton id={eventId} />);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect(screen.getByRole("button", { name: "삭제 중..." }).hasAttribute("disabled")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "삭제 중..." }));
    expect(mocks.deleteScheduleEvent).toHaveBeenCalledTimes(1);

    await act(async () => { finish?.({ success: false, message: referenceMessage }); });
    expect(screen.getByRole("alert").textContent).toBe(referenceMessage);
    expect(screen.getByRole("button", { name: "삭제" }).hasAttribute("disabled")).toBe(false);
  });

  it("통신 예외 원문을 노출하지 않고 한국어 안내 뒤 재시도를 허용한다", async () => {
    mocks.deleteScheduleEvent.mockRejectedValueOnce(new Error("private@example.test DELETE FROM schedule_events"));
    render(<ScheduleDeleteButton id={eventId} />);

    fireEvent.click(screen.getByRole("button", { name: "삭제" }));
    expect((await screen.findByRole("alert")).textContent).toBe("삭제 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.");
    expect(document.body.textContent).not.toMatch(/private@example|DELETE|schedule_events/);
    expect(screen.getByRole("button", { name: "삭제" }).hasAttribute("disabled")).toBe(false);
  });
});
