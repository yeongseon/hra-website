// @vitest-environment node
/**
 * 실제 공개 조회 함수의 세션·역할·기능 gate·직접 ID 호출·DTO 응답 경계를 검증한다.
 * DB 조인의 실제 SQL 권한 검증은 별도 격리 PostgreSQL 테스트가 담당한다.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), target: vi.fn(), list: vi.fn(), detail: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/features/academics/student-assignments/data", () => ({
  buildAssignmentTargetLookup: mocks.target, buildStudentAssignmentListQuery: mocks.list, buildStudentAssignmentDetailQuery: mocks.detail,
}));
import { AcademicAccessError, canViewAssignment, requireAcademicStudent, requireAssignmentTarget } from "@/lib/academic-permissions";
import { getMyAssignment, getMyAssignments } from "@/features/academics/student-assignments/queries";

const userId = "10000000-0000-4000-8000-000000000001";
const assignmentId = "20000000-0000-4000-8000-000000000001";
const targetId = "30000000-0000-4000-8000-000000000001";
const fileId = "40000000-0000-4000-8000-000000000001";
const row = { assignmentId, targetId, title: "본인 과제", instructions: "과제 안내", status: "PUBLISHED", dueAt: new Date("2026-11-01T00:00:00Z"),
  publishedAt: new Date("2026-10-01T00:00:00Z"), submittedAt: new Date("2026-10-02T00:00:00Z"),
  fileId, originalName: "제출.pdf", mimeType: "application/pdf", sizeBytes: 2048,
  storageKey: "노출 금지 저장 키", fileUrl: "노출 금지 URL", checksum: "노출 금지 해시", email: "노출 금지 이메일", submissionKey: "노출 금지 키",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ACADEMIC_ENABLED", "true");
  mocks.auth.mockResolvedValue({ user: { id: userId, role: "MEMBER" } });
  mocks.target.mockResolvedValue([row]); mocks.list.mockResolvedValue([row]); mocks.detail.mockResolvedValue([row]);
});
afterEach(() => vi.unstubAllEnvs());

it.each([null, "ADMIN", "FACULTY", "PENDING", "잘못된 역할"])("역할 %s는 학사 DB 조회 전에 모든 학생 진입점에서 거부한다", async role => {
  mocks.auth.mockResolvedValue(role === null ? null : { user: { id: userId, role } });
  const code = role === null ? "UNAUTHENTICATED" : "FORBIDDEN";
  await expect(getMyAssignments()).rejects.toMatchObject({ code });
  await expect(getMyAssignment(assignmentId)).rejects.toMatchObject({ code });
  await expect(requireAssignmentTarget({ targetId })).rejects.toMatchObject({ code });
  expect(await canViewAssignment(assignmentId)).toBe(false);
  expect(mocks.target).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled(); expect(mocks.detail).not.toHaveBeenCalled();
});

it("인증 다음 기능 gate를 검사하며 비활성 환경에서는 신규 학사 DB를 읽지 않는다", async () => {
  vi.stubEnv("ACADEMIC_ENABLED", "false");
  await expect(getMyAssignments()).rejects.toMatchObject({ code: "DISABLED", status: 404, message: "과제를 찾을 수 없습니다." });
  expect(mocks.auth).toHaveBeenCalledOnce();
  mocks.auth.mockResolvedValue(null);
  await expect(requireAcademicStudent()).rejects.toMatchObject({ code: "UNAUTHENTICATED", status: 401 });
  expect(mocks.target).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
});

it.each([undefined, "", "not-a-uuid"])("세션 계정 ID %s를 DB에 전달하지 않는다", async id => {
  mocks.auth.mockResolvedValue({ user: { id, role: "MEMBER" } });
  await expect(getMyAssignments()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  expect(mocks.list).not.toHaveBeenCalled();
});

it("올바른 MEMBER 세션 ID만 DB 소유권 조회에 전달하고 허용 필드만 반환한다", async () => {
  expect(await requireAssignmentTarget({ targetId })).toEqual({ userId, assignmentId, targetId, status: "PUBLISHED", dueAt: row.dueAt, publishedAt: row.publishedAt });
  expect(mocks.target).toHaveBeenCalledWith({}, userId, { targetId });
  expect(await canViewAssignment(assignmentId)).toBe(true);
  const detail = await getMyAssignment(assignmentId);
  expect(detail).toEqual({ assignmentId, targetId, title: row.title, instructions: row.instructions, status: "PUBLISHED",
    dueAt: row.dueAt.toISOString(), publishedAt: row.publishedAt.toISOString(), submission: { submittedAt: row.submittedAt.toISOString() },
    file: { fileId, originalName: row.originalName, mimeType: row.mimeType, sizeBytes: row.sizeBytes } });
  expect(mocks.detail).toHaveBeenCalledWith({}, userId, targetId);
  expect(JSON.stringify(detail)).not.toContain("노출 금지");
});

it("목록은 정해진 크기와 다음 페이지 여부만 반환하고 파일 식별자를 제외한다", async () => {
  mocks.list.mockResolvedValue([row, { ...row, assignmentId: "다음 행" }]);
  const result = await getMyAssignments({ page: 2, pageSize: 1 });
  expect(mocks.list).toHaveBeenCalledWith({}, userId, 2, 1);
  expect(result).toMatchObject({ page: 2, pageSize: 1, hasNextPage: true });
  expect(result.items).toHaveLength(1);
  expect(Object.keys(result.items[0])).toEqual(["assignmentId", "targetId", "title", "status", "dueAt", "publishedAt", "submission"]);
  expect(JSON.stringify(result)).not.toContain(fileId);
  expect(JSON.stringify(result)).not.toContain("노출 금지");
});

it("미제출은 null로 구분하고 업로드 의도를 최종 완료로 취급하지 않는다", async () => {
  mocks.detail.mockResolvedValue([{ ...row, submittedAt: null, fileId: null, originalName: null, mimeType: null, sizeBytes: null }]);
  const result = await getMyAssignment(assignmentId);
  expect(result.submission).toBeNull(); expect(result.file).toBeNull();
});

it.each([{ page: 0 }, { page: 10001 }, { pageSize: 0 }, { pageSize: 51 }, { page: 1.2 }, { userId }, { cohortId: assignmentId }, null])("부적절한 페이지 요청 %j를 DB 전에 거부한다", async input => {
  await expect(getMyAssignments(input)).rejects.toMatchObject({ code: "INVALID_INPUT", status: 422 });
  expect(mocks.list).not.toHaveBeenCalled();
});

it("잘못된 UUID·타인의 대상·비공개·대상 없음은 동일한 404 결과다", async () => {
  await expect(getMyAssignment("잘못된 ID")).rejects.toMatchObject({ code: "NOT_FOUND", status: 404, message: "과제를 찾을 수 없습니다." });
  expect(mocks.target).not.toHaveBeenCalled();
  mocks.target.mockResolvedValue([]);
  await expect(getMyAssignment(assignmentId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404, message: "과제를 찾을 수 없습니다." });
  await expect(requireAssignmentTarget({ targetId })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  expect(await canViewAssignment(assignmentId)).toBe(false);
  expect(mocks.detail).not.toHaveBeenCalled();
});

it("계정·학적 추가 인수나 두 종류 식별자를 혼합해 권한 조회를 우회하지 못한다", async () => {
  const extraIdentity = { targetId, userId, studentId: userId };
  await expect(requireAssignmentTarget(extraIdentity)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  await expect(requireAssignmentTarget({ assignmentId, targetId })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
  expect(mocks.target).not.toHaveBeenCalled();
});

it("비정상 최종 파일 메타와 유효하지 않은 날짜를 정상 완료로 반환하지 않는다", async () => {
  mocks.detail.mockResolvedValueOnce([{ ...row, fileId: null }]);
  await expect(getMyAssignment(assignmentId)).rejects.toMatchObject({ code: "UNAVAILABLE", status: 503 });
  mocks.list.mockResolvedValueOnce([{ ...row, dueAt: new Date("잘못된 날짜") }]);
  await expect(getMyAssignments()).rejects.toMatchObject({ code: "UNAVAILABLE", status: 503 });
});

it("학적이 두 조회 사이 종료되어도 상세의 두 번째 소유권 조인 결과를 따라 거부한다", async () => {
  mocks.detail.mockResolvedValue([]);
  await expect(getMyAssignment(assignmentId)).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
});

it("인증 및 DB 장애는 원문을 노출하지 않는 한국어 503 오류로 처리한다", async () => {
  mocks.auth.mockRejectedValueOnce(new Error("비밀 인증 정보"));
  await expect(getMyAssignments()).rejects.toMatchObject({ code: "UNAVAILABLE", status: 503, message: "과제를 조회할 수 없습니다. 잠시 후 다시 시도해 주세요." });
  mocks.target.mockRejectedValue(new Error("SQL과 개인정보가 포함된 오류"));
  await expect(canViewAssignment(assignmentId)).rejects.toBeInstanceOf(AcademicAccessError);
  await expect(getMyAssignment(assignmentId)).rejects.toMatchObject({ code: "UNAVAILABLE", status: 503 });
});
