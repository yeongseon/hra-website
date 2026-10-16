/** 명부 폼의 정확한 한국어 접근성 이름이 선택지 텍스트와 섞이지 않도록 검증한다. */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@/features/academics/roster/actions", () => ({ registerStudent: vi.fn(async () => ({})) }));
import { RosterForm } from "@/app/(academic)/admin/academics/students/_components/roster-form";
const id = "10000000-0000-4000-8000-000000000001";
afterEach(cleanup);

describe("명부 등록 폼의 명시적 레이블 연결", () => {
  it("모든 선택 필드가 정확한 레이블과 접근성 이름을 갖는다", () => {
    render(createElement(RosterForm, { cohorts: [{ id, name: "시험 기수" }], requestId: id }));
    for (const label of ["등록 유형", "등록할 기수", "본인 확인 방식"]) {
      const select = screen.getByRole("combobox", { name: label });
      expect(screen.getByLabelText(label, { exact: true })).toBe(select);
      expect(document.querySelector(`label[for="${select.id}"]`)?.textContent).toBe(label);
    }
    for (const label of ["표시 이름", "승인 근거 참조 식별자"]) {
      expect(screen.getByRole("textbox", { name: label }))
        .toBe(screen.getByLabelText(label, { exact: true }));
    }
  });
  it("기존 학생으로 전환해도 식별자 필드와 레이블이 명시적으로 연결된다", () => {
    render(createElement(RosterForm, { cohorts: [{ id, name: "시험 기수" }], requestId: id }));
    fireEvent.change(screen.getByLabelText("등록 유형", { exact: true }), { target: { value: "existing" } });
    expect(screen.getByRole("textbox", { name: "기존 학생 식별자" }))
      .toBe(screen.getByLabelText("기존 학생 식별자", { exact: true }));
    expect(screen.queryByLabelText("표시 이름", { exact: true })).toBeNull();
  });
});
