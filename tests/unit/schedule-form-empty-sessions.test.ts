/**
 * 일정 수정 폼이 세션 없는 기존 수업에 빈 세션을 자동 추가하지 않는지 검증합니다 (#126).
 * 새 일정에는 기존의 기본 세션 세 개가 계속 표시되어야 합니다.
 */
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ScheduleForm } from "@/app/(admin)/admin/schedule/_components/schedule-form";

const action = async () => ({ success: false, message: "" });

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(cleanup);

describe("일정 폼의 초기 세션", () => {
  it("세션 없는 기존 수업을 수정할 때 빈 배열을 유지한다", () => {
    const view = render(createElement(ScheduleForm, {
      title: "일정 수정",
      submitLabel: "저장",
      action,
      faculties: [],
      cohorts: [],
      defaultValues: { eventType: "CLASS", sessions: [] },
    }));

    const input = view.container.querySelector<HTMLInputElement>('input[name="sessionsJson"]');
    expect(input?.value).toBe("[]");
  });

  it("기존 세션 UUID는 로컬 키와 구분해 편집 후에도 전송한다", () => {
    const serverId = "60000000-0000-4000-8000-000000000001";
    const view = render(createElement(ScheduleForm, {
      title: "일정 수정", submitLabel: "저장", action, faculties: [], cohorts: [],
      defaultValues: { eventType: "CLASS", sessions: [{serverId, category:"CLASSICS", facultyId:null,
        content:"기존 내용",reportCategory:null,subTitle:null,subDescription:null,order:0}] },
    }));
    fireEvent.change(view.getByDisplayValue("기존 내용"), {target:{value:"편집한 내용"}});
    const input = view.container.querySelector<HTMLInputElement>('input[name="sessionsJson"]');
    const [session] = JSON.parse(input?.value ?? "[]");
    expect(session.serverId).toBe(serverId);
    expect(session.id).not.toBe(serverId);
    expect(session.content).toBe("편집한 내용");
  });

  it("새 일정을 등록할 때만 기본 세션 세 개를 표시한다", () => {
    const view = render(createElement(ScheduleForm, {
      title: "새 일정 등록",
      submitLabel: "등록",
      action,
      faculties: [],
      cohorts: [],
    }));

    const input = view.container.querySelector<HTMLInputElement>('input[name="sessionsJson"]');
    expect(JSON.parse(input?.value ?? "[]")).toHaveLength(3);
  });
});
