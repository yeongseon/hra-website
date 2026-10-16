// @vitest-environment node
/** 명부 액션과 읽기 경계가 지정 승인자 인가 및 쓰기 활성화 전에 DB를 호출하지 않는지 검증한다. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ require: vi.fn(), enabled: vi.fn(), register: vi.fn(), revalidate: vi.fn(), redirect: vi.fn(), select: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/academic-admin", () => ({ requireAcademicApprover: mocks.require, assertAcademicWritesEnabled: mocks.enabled }));
vi.mock("@/lib/db/academic-roster", () => ({ registerAcademicStudent: mocks.register, rosterErrorMessage: () => "등록 실패" }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { registerStudent } from "@/features/academics/roster/actions";
import { getAcademicRoster, getAcademicStudent, getRosterCohorts } from "@/features/academics/roster/queries";
import StudentsPage from "@/app/(academic)/admin/academics/students/page";
import StudentPage from "@/app/(academic)/admin/academics/students/[id]/page";
import NewStudentPage from "@/app/(academic)/admin/academics/students/new/page";
import AcademicPage from "@/app/(academic)/admin/academics/page";
import AcademicLayout from "@/app/(academic)/admin/academics/layout";
const id = "10000000-0000-4000-8000-000000000001";
const data = () => {
  const form = new FormData();
  for (const [key, value] of Object.entries({ requestId: id, cohortId: id, studentId: "", displayName: "학생", verificationMethod: "IN_PERSON", evidenceReference: id })) form.set(key, value);
  return form;
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  mocks.require.mockResolvedValue(id);
  mocks.register.mockResolvedValue({ studentId: id, enrollmentId: id });
  mocks.redirect.mockImplementation(() => { throw new Error("이동"); });
});
afterEach(() => vi.unstubAllEnvs());
describe("명부 서버 경계", () => {
  it.each(["비로그인", "MEMBER", "FACULTY", "ADMIN"])("지정 승인이 없는 %s 호출을 직접 거부한다", async () => {
    mocks.require.mockRejectedValue(new Error("권한 없음"));
    await expect(registerStudent({}, data())).rejects.toThrow("권한 없음");
    await expect(getAcademicRoster()).rejects.toThrow("권한 없음");
    await expect(getAcademicStudent(id)).rejects.toThrow("권한 없음");
    await expect(getRosterCohorts()).rejects.toThrow("권한 없음");
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it.each([undefined, "false", "", "TRUE"])("전체 공개가 꺼진 %s 상태에서는 직접 읽기·쓰기를 DB 호출 전에 거부한다", async value => {
    vi.stubEnv("ACADEMIC_ENABLED", value);
    await expect(registerStudent({}, data())).rejects.toThrow("준비");
    await expect(getAcademicRoster()).rejects.toThrow("준비");
    await expect(getAcademicStudent(id)).rejects.toThrow("준비");
    await expect(getRosterCohorts()).rejects.toThrow("준비");
    expect(mocks.register).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.enabled).not.toHaveBeenCalled();
  });
  const pages = [
    ["학사 기본", () => AcademicPage()],
    ["목록", () => StudentsPage({ searchParams: Promise.resolve({}) })],
    ["상세", () => StudentPage({ params: Promise.resolve({ id }) })],
    ["등록", () => NewStudentPage({ searchParams: Promise.resolve({}) })],
    ["레이아웃", () => AcademicLayout({ children: "숨겨야 하는 자식" })],
  ] as const;
  it.each(pages)("%s 진입점 자체가 비공개 시 인가 후 준비 안내를 내보내고 학사 DB를 조회하지 않는다", async (_name, render) => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    const html = renderToStaticMarkup(await render());
    expect(html).toContain("학사관리 준비 중");
    expect(html).not.toContain("숨겨야 하는 자식");
    expect(html).not.toContain("ACADEMIC_ENABLED");
    expect(mocks.require).toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it.each(pages)("%s 준비 안내도 비승인자에게 제공하지 않는다", async (_name, render) => {
    vi.stubEnv("ACADEMIC_ENABLED", "false");
    mocks.require.mockRejectedValue(new Error("권한 없음"));
    await expect(render()).rejects.toThrow("권한 없음");
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("등록 준비가 안 된 경우 DB 변경을 거부한다", async () => {
    mocks.enabled.mockImplementation(() => { throw new Error("준비 중"); });
    await expect(registerStudent({}, data())).rejects.toThrow("준비 중");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("입력 오류는 DB 호출 없이 한국어 메시지를 반환한다", async () => {
    const form = data(); form.set("displayName", "");
    expect((await registerStudent({}, form)).error).toContain("표시 이름");
    expect(mocks.register).not.toHaveBeenCalled();
  });
  it("검증된 입력에 인증 actor를 붙여 등록하고 명부를 갱신한다", async () => {
    await expect(registerStudent({}, data())).rejects.toThrow("이동");
    expect(mocks.register).toHaveBeenCalledWith(expect.objectContaining({ displayName: "학생", studentId: "" }), id);
    expect(mocks.revalidate).toHaveBeenCalledWith("/admin/academics/students");
    expect(mocks.redirect).toHaveBeenCalledWith(`/admin/academics/students/${id}`);
  });
});
