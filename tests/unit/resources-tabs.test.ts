/**
 * 자료실의 상세 복귀 탭과 기수 없는 공통 자료 필터를 확인합니다 (#130).
 */
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ResourcesTabs, type ResourceItem } from "@/app/(member)/resources/_components/resources-tabs";

const cohortId = "11111111-1111-4111-8111-111111111111";
const items: ResourceItem[] = [
  { id: "shared", title: "공통 강의 자료", category: "강의 자료", date: new Date("2026-01-01"), cohortId: null },
  { id: "template", title: "공통 보고서 양식", category: "보고서 양식", date: new Date("2026-01-01"), cohortId: null },
  { id: "cohort", title: "1기 수업일지", category: "주차별 수업일지", date: new Date("2026-01-01"), cohortId },
];

beforeAll(() => {
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

afterEach(cleanup);

describe("자료실 탭", () => {
  it("상세 페이지에서 지정한 카테고리로 돌아온다", () => {
    render(createElement(ResourcesTabs, {
      initialCategory: "강의 자료",
      items,
      cohorts: [],
      userCohortId: null,
      userRole: "MEMBER",
    }));

    expect(screen.getByText("공통 강의 자료")).toBeTruthy();
    expect(screen.queryByText("공통 보고서 양식")).toBeNull();
  });

  it("기수를 선택해도 공통 강의 자료와 보고서 양식이 보인다", () => {
    render(createElement(ResourcesTabs, {
      initialCategory: "강의 자료",
      items,
      cohorts: [{ id: cohortId, name: "1기" }],
      userCohortId: cohortId,
      userRole: "MEMBER",
    }));

    fireEvent.click(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "1기" }));
    expect(screen.getByText("공통 강의 자료")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "보고서 양식" }));
    expect(screen.getByText("공통 보고서 양식")).toBeTruthy();
  });
});
