/** 공개 후 과제를 편집 폼으로 표시하지 않고 확인 화면의 버전 불일치도 거부하는지 검증한다. */
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ ready: vi.fn(), detail: vi.fn(), options: vi.fn(), preview: vi.fn() }));
vi.mock("@/features/academics/assignments/admin-queries", () => ({ getAssignmentAdminAvailability: mocks.ready,
  getAssignmentAdmin: mocks.detail, getAssignmentFormOptions: mocks.options, getAssignmentPublishPreview: mocks.preview }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }), notFound: () => { throw new Error("찾을 수 없음"); } }));
vi.mock("@/features/academics/assignments/actions", () => ({ createAssignment: vi.fn(), updateDraftAssignment: vi.fn(), publishAssignment: vi.fn(), closeAssignment: vi.fn() }));
import AssignmentDetailPage from "@/app/(academic)/admin/academics/assignments/[id]/page";
import PublishAssignmentPage from "@/app/(academic)/admin/academics/assignments/[id]/publish/page";
const id = "10000000-0000-4000-8000-000000000001";
const updatedAt = "2030-01-01T00:00:00.123456+00:00";
const record = (status: "DRAFT" | "PUBLISHED" | "CLOSED") => ({ id, cohortName: "시험 기수", eventTitle: null,
  sessionLabel: null, submissionCount: 2, result: { targetCount: 3, replayed: false,
    assignment: { id, cohortId: id, scheduleEventId: null, scheduleSessionId: null, title: "과제 제목",
      instructions: "안내", dueAt: "2035-01-01T12:00:00+00:00", status, createdByUserId: id,
      publishedByUserId: status === "DRAFT" ? null : id, publishedAt: status === "DRAFT" ? null : updatedAt,
      createdAt: updatedAt, updatedAt } } });
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "true");
  mocks.ready.mockResolvedValue(true);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("과제 관리 상태별 화면", () => {
  it.each(["PUBLISHED", "CLOSED"] as const)("%s 과제에는 수정·삭제 입력을 제공하지 않는다", async status => {
    mocks.detail.mockResolvedValue(record(status));
    render(await AssignmentDetailPage({ params: Promise.resolve({ id }) }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /저장|삭제/ })).toBeNull();
    expect(screen.getByText("3명", { exact: true })).toBeTruthy();
    expect(screen.getByText("2명", { exact: true })).toBeTruthy();
    expect(mocks.options).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "과제 종료" }) !== null).toBe(status === "PUBLISHED");
  });
  it("화면 본문과 대상 미리보기의 초안 버전이 다르면 공개 폼을 내보내지 않는다", async () => {
    mocks.detail.mockResolvedValue(record("DRAFT"));
    mocks.preview.mockResolvedValue({ assignmentId: id, expectedUpdatedAt: "2030-01-02T00:00:00+00:00",
      expectedTargetFingerprint: "a".repeat(64), reviewedAt: updatedAt, targetCount: 3, unlinkedCount: 1 });
    render(await PublishAssignmentPage({ params: Promise.resolve({ id }) }));
    expect(screen.getByRole("alert").textContent).toContain("최신 상태");
    expect(screen.queryByRole("button", { name: "확인한 대상으로 공개" })).toBeNull();
  });
  it("이미 공개한 과제는 재진입 시 고정 대상 결과를 보여준다", async () => {
    mocks.detail.mockResolvedValue(record("PUBLISHED"));
    const element = await PublishAssignmentPage({ params: Promise.resolve({ id }) });
    render(createElement("div", {}, element));
    expect(screen.getByText(/확정 대상 3명/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "확인한 대상으로 공개" })).toBeNull();
    expect(mocks.preview).not.toHaveBeenCalled();
  });
});
