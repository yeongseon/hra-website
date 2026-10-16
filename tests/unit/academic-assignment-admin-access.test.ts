// @vitest-environment node
/** 새 관리 쿼리와 각 페이지가 독립적으로 지정 승인자와 공개 준비를 확인하는지 검증한다. */
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ require: vi.fn(), execute: vi.fn(), select: vi.fn(), list: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/academic-admin", () => ({ requireAcademicApprover: mocks.require, getAcademicApproverId: () => id }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute, select: mocks.select } }));
vi.mock("@/features/academics/assignments/service", () => ({ listAssignmentsAdmin: mocks.list }));
vi.mock("@/features/academics/assignments/actions", () => ({
  createAssignment: vi.fn(), updateDraftAssignment: vi.fn(), publishAssignment: vi.fn(), closeAssignment: vi.fn(),
}));
import * as queries from "@/features/academics/assignments/admin-queries";
import AssignmentsPage from "@/app/(academic)/admin/academics/assignments/page";
import NewAssignmentPage from "@/app/(academic)/admin/academics/assignments/new/page";
import AssignmentDetailPage from "@/app/(academic)/admin/academics/assignments/[id]/page";
import PublishAssignmentPage from "@/app/(academic)/admin/academics/assignments/[id]/publish/page";
const id = "10000000-0000-4000-8000-000000000001";
const reads = [() => queries.getAssignmentAdmin(id), () => queries.getAssignmentAdminList({}),
  () => queries.getAssignmentCohorts(), () => queries.getAssignmentFormOptions(), () => queries.getAssignmentPublishPreview(id)];
const pages = [
  ["목록", () => AssignmentsPage({ searchParams: Promise.resolve({}) })],
  ["신규 초안", () => NewAssignmentPage()],
  ["상세", () => AssignmentDetailPage({ params: Promise.resolve({ id }) })],
  ["공개 대상", () => PublishAssignmentPage({ params: Promise.resolve({ id }) })],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  mocks.require.mockResolvedValue(id);
  mocks.execute.mockResolvedValue({ rows: [{ permitted: true, records: [{ ready: false }] }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("과제 관리의 독립적인 서버 조회 경계", () => {
  it("지정 승인이 없는 직접 조회는 SQL과 목록 서비스보다 먼저 거부한다", async () => {
    mocks.require.mockRejectedValue(new Error("권한 없음"));
    for (const read of reads) await expect(read()).rejects.toThrow("권한 없음");
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it.each([undefined, "false", "TRUE"])("공개 설정 %s에서는 직접 조회가 DB 호출 전에 거부된다", async value => {
    vi.stubEnv("ACADEMIC_ENABLED", value);
    for (const read of reads) await expect(read()).rejects.toThrow("준비");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it("제출 구조가 미준비이면 0건 목록을 만들지 않고 준비 상태로 거부한다", async () => {
    for (const read of reads) await expect(read()).rejects.toThrow("준비");
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it.each(pages)("%s 페이지는 비공개 시 승인자 확인 후 DB 없이 안내한다", async (_name, render) => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("과제 관리 준비 중");
    expect(html).not.toContain("ACADEMIC_ENABLED");
    expect(mocks.require).toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it.each(pages)("%s 준비 페이지도 비승인자에게 노출하지 않는다", async (_name, render) => {
    mocks.require.mockRejectedValue(new Error("권한 없음"));
    await expect(render()).rejects.toThrow("권한 없음");
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
