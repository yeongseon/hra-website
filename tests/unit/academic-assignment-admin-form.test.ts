/** 과제 폼의 한국시간·명시 레이블·기수와 수업 연결·쓰기 중지 상태를 검증한다. */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), create: vi.fn(), update: vi.fn(), publish: vi.fn(), close: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }) }));
vi.mock("@/features/academics/assignments/actions", () => ({ createAssignment: mocks.create, updateDraftAssignment: mocks.update, publishAssignment: mocks.publish, closeAssignment: mocks.close }));
import { AssignmentForm } from "@/app/(academic)/admin/academics/assignments/_components/assignment-form";
import { AssignmentTransitionForm } from "@/app/(academic)/admin/academics/assignments/_components/assignment-transition-form";
import { assignmentKstInput, formatAssignmentKst } from "@/features/academics/assignments/admin-display";
const id = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const options = { cohorts: [{ id, name: "가 기수" }, { id: other, name: "나 기수" }],
  events: [{ id: "event-a", cohortId: id, title: "가 수업" }, { id: "event-b", cohortId: other, title: "나 수업" }],
  sessions: [{ id: "session-a", eventId: "event-a", label: "가 세부 수업" }] };
beforeEach(() => vi.resetAllMocks());
afterEach(cleanup);

describe("과제 관리 폼", () => {
  it("한국시간 입력과 표시가 서버 시간대에 의존하지 않는다", () => {
    expect(assignmentKstInput("2030-01-01T15:00:01.000Z")).toBe("2030-01-02T00:00:01");
    expect(assignmentKstInput(null)).toBe("");
    expect(formatAssignmentKst(null)).toBe("마감 미정");
    expect(formatAssignmentKst("2030-01-01T15:00:01.000Z")).toContain("2030");
  });
  it("정확한 한국어 레이블을 제공하고 기수 변경 시 다른 기수 수업 선택을 제거한다", () => {
    render(createElement(AssignmentForm, { options, requestId: id, writable: true }));
    for (const name of ["대상 기수", "연결 수업", "연결 세부 수업"]) {
      expect(screen.getByRole("combobox", { name })).toBe(screen.getByLabelText(name, { exact: true }));
    }
    fireEvent.change(screen.getByLabelText("대상 기수", { exact: true }), { target: { value: id } });
    fireEvent.change(screen.getByLabelText("연결 수업", { exact: true }), { target: { value: "event-a" } });
    fireEvent.change(screen.getByLabelText("연결 세부 수업", { exact: true }), { target: { value: "session-a" } });
    fireEvent.change(screen.getByLabelText("대상 기수", { exact: true }), { target: { value: other } });
    expect((screen.getByLabelText("연결 수업", { exact: true }) as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("연결 세부 수업", { exact: true }) as HTMLSelectElement).value).toBe("");
    expect(screen.queryByRole("option", { name: "가 수업" })).toBeNull();
    expect(screen.getByRole("option", { name: "나 수업" })).toBeTruthy();
  });
  it("쓰기 중지 상태는 편집·저장·상태 전환을 비활성화한다", () => {
    const view = render(createElement(AssignmentForm, { options, requestId: id, writable: false }));
    expect(view.container.querySelector("fieldset")?.disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("변경이 중지");
    view.unmount();
    const transition = render(createElement(AssignmentTransitionForm, { kind: "close", assignmentId: id, requestId: other, writable: false }));
    expect(transition.container.querySelector("fieldset")?.disabled).toBe(true);
    expect(screen.getByLabelText("과제를 종료하면 학생의 추가 제출을 받을 수 없음을 확인했습니다.", { exact: true })).toBeTruthy();
  });
  it("초안 저장의 검증 오류와 재시도가 같은 요청 키를 유지한다", async () => {
    mocks.create.mockResolvedValueOnce({ success: false, message: "과제 입력값을 확인해 주세요.", referenceId: id })
      .mockResolvedValueOnce({ success: true, assignment: { id } });
    const view = render(createElement(AssignmentForm, { options, requestId: other, writable: true }));
    fireEvent.change(screen.getByLabelText("대상 기수", { exact: true }), { target: { value: id } });
    fireEvent.change(screen.getByLabelText("과제 제목", { exact: true }), { target: { value: "시험 과제" } });
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("과제 입력값을 확인"));
    expect(screen.getByRole("alert").textContent).toContain(`요청 참조: ${id}`);
    expect(screen.getByRole("alert").textContent).not.toContain(other);
    expect((screen.getByLabelText("과제 제목", { exact: true }) as HTMLInputElement).value).toBe("시험 과제");
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(`/admin/academics/assignments/${id}`));
    expect(mocks.create.mock.calls.map(call => call[0].requestId)).toEqual([other, other]);
    expect(mocks.create.mock.calls[1][0]).toEqual(mocks.create.mock.calls[0][0]);
  });
  it("공개는 확인한 초안 버전과 대상 fingerprint를 보내고 오류 이후에도 요청 키를 보존한다", async () => {
    const preview = { assignmentId: id, expectedUpdatedAt: "2030-01-01T00:00:00.123456+00:00",
      expectedTargetFingerprint: "a".repeat(64), reviewedAt: "2030-01-01T00:00:01+00:00", targetCount: 4, unlinkedCount: 1 };
    mocks.publish.mockResolvedValueOnce({ success: false, message: "공개 대상 명부가 변경되었습니다. 미리보기를 다시 확인해 주세요.", referenceId:id })
      .mockResolvedValueOnce({ success: true, targetCount: 4 });
    const view = render(createElement(AssignmentTransitionForm, { kind: "publish", assignmentId: id, requestId: other, writable: true, preview }));
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("미리보기를 다시 확인"));
    expect(screen.getByRole("alert").textContent).toContain(`요청 참조: ${id}`);
    expect(screen.getByRole("button", { name: "최신 대상으로 다시 확인" })).toBeTruthy();
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("확정 대상 4명"));
    expect(mocks.publish).toHaveBeenNthCalledWith(1, { assignmentId: id, requestId: other,
      expectedUpdatedAt: preview.expectedUpdatedAt, expectedTargetFingerprint: preview.expectedTargetFingerprint });
    expect(mocks.publish.mock.calls[1][0]).toEqual(mocks.publish.mock.calls[0][0]);
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("통신 오류 뒤 동일 종료 요청을 재시도할 때 확인 체크 상태를 유지한다", async () => {
    mocks.close.mockRejectedValueOnce(Object.assign(new Error("SELECT synthetic@example.invalid https://private.invalid/token"),{referenceId:id}));
    const view = render(createElement(AssignmentTransitionForm, { kind: "close", assignmentId: id, requestId: other, writable: true }));
    const confirmation = screen.getByRole("checkbox") as HTMLInputElement;
    fireEvent.click(confirmation);
    expect(confirmation.checked).toBe(true);
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("같은 화면에서 다시 시도"));
    expect(screen.getByRole("alert").textContent).not.toContain("요청 참조");
    expect(screen.getByRole("alert").textContent).not.toContain("synthetic@example.invalid");
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });
  it("종료 액션의 서버 참조는 메시지와 별도로 표시한다",async()=>{
    mocks.close.mockResolvedValue({success:false,message:"과제를 종료하지 못했습니다.",referenceId:id});
    const view=render(createElement(AssignmentTransitionForm,{kind:"close",assignmentId:id,requestId:other,writable:true}));
    fireEvent.submit(view.container.querySelector("form")!);
    await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain(`요청 참조: ${id}`));
    expect(screen.getByRole("alert").textContent).toContain("과제를 종료하지 못했습니다.");
  });

});
