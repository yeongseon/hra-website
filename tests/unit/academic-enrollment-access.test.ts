// @vitest-environment node
/** 지정 책임자·실제 세션·저장 활성화 경계를 검증하고 CLI와 동일한 계획 형식을 사용합니다. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), execute: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ db: { execute: mocks.execute } }));

import { canManageAcademics } from "@/lib/academic-access";
import { requireAcademicApprover } from "@/lib/academic-admin";
import { applyEnrollmentLinkPlan, inspectEnrollmentCandidates } from "@/features/academics/enrollments/service";
import { enrollmentPlanSchema } from "@/features/academics/enrollments/plan.mjs";

const actor = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const plan = () => ({ requestId: "20000000-0000-4000-8000-000000000001", approverUserId: actor,
  approvalReferenceId: "30000000-0000-4000-8000-000000000001", verificationMethod: "IN_PERSON",
  links: [{ studentId: "40000000-0000-4000-8000-000000000001", userId: other,
    cohortId: "50000000-0000-4000-8000-000000000001", expectedRole: "MEMBER", expectedCohortId: null }] });

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ACADEMIC_APPROVER_USER_ID", actor);
  vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "true");
  mocks.auth.mockResolvedValue({ user: { id: actor, role: "FACULTY" } });
  mocks.execute.mockResolvedValue({ rows: [{ result: { requestId: plan().requestId,
    linkedCount: 1, enrolledCount: 1, replayed: false } }] });
});
afterEach(() => vi.unstubAllEnvs());

describe("지정 학사 운영 책임자", () => {
  it.each(["ADMIN", "FACULTY", "MEMBER"])("지정된 승인 역할 %s만 허용한다", async role => {
    expect(canManageAcademics({ id: actor, role })).toBe(true);
    mocks.auth.mockResolvedValue({ user: { id: actor, role } });
    expect(await requireAcademicApprover()).toBe(actor);
  });

  it.each([null, undefined, { id: other, role: "ADMIN" }, { id: actor, role: "PENDING" },
    { id: actor, role: "OTHER" }, { role: "ADMIN" }])("미인증·미지정·승인대기 접근을 거부한다 (%j)", async user => {
    expect(canManageAcademics(user)).toBe(false);
    mocks.auth.mockResolvedValue(user ? { user } : null);
    await expect(requireAcademicApprover()).rejects.toThrow("책임자");
    await expect(applyEnrollmentLinkPlan(plan())).rejects.toThrow();
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("지정 계정 설정 누락·잘못된 UUID를 거부하고 ADMIN을 자동 선택하지 않는다", async () => {
    for (const configured of ["", "not-a-uuid"]) {
      vi.stubEnv("ACADEMIC_APPROVER_USER_ID", configured);
      expect(canManageAcademics({ id: actor, role: "ADMIN" })).toBe(false);
      await expect(requireAcademicApprover()).rejects.toThrow("지정");
    }
  });

  it("세션 오류·저장 비활성·다른 승인자·임의 actor 입력에서 DB 쓰기를 막는다", async () => {
    mocks.auth.mockRejectedValueOnce(new Error("인증 실패"));
    await expect(applyEnrollmentLinkPlan(plan())).rejects.toThrow("인증 실패");
    vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "false");
    await expect(applyEnrollmentLinkPlan(plan())).rejects.toThrow("활성화");
    vi.stubEnv("ACADEMIC_ENROLLMENT_WRITES_ENABLED", "true");
    await expect(applyEnrollmentLinkPlan({ ...plan(), approverUserId: other })).rejects.toThrow("일치");
    await expect(applyEnrollmentLinkPlan({ ...plan(), actorUserId: actor })).rejects.toThrow("형식");
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("인증된 FACULTY 책임자만 계획을 적용하며 후보 조회에도 같은 인가를 적용한다", async () => {
    expect(await applyEnrollmentLinkPlan(plan())).toMatchObject({ linkedCount: 1, replayed: false });
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    mocks.execute.mockResolvedValueOnce({ rows: [{ report: { candidates: [] } }] });
    expect(await inspectEnrollmentCandidates()).toEqual({ candidates: [] });
    mocks.auth.mockResolvedValueOnce({ user: { id: other, role: "ADMIN" } });
    await expect(inspectEnrollmentCandidates()).rejects.toThrow("책임자");
    expect(mocks.execute).toHaveBeenCalledTimes(2);
  });

  it("알 수 없는 개인정보 필드·동일 학생/계정 중복·PENDING 계획을 거부한다", () => {
    expect(enrollmentPlanSchema.safeParse({ ...plan(), email: "private@example.invalid" }).success).toBe(false);
    const duplicate = plan();
    duplicate.links.push({ ...duplicate.links[0] });
    expect(enrollmentPlanSchema.safeParse(duplicate).success).toBe(false);
    const pending = plan();
    pending.links[0].expectedRole = "PENDING";
    expect(enrollmentPlanSchema.safeParse(pending).success).toBe(false);
    const sameUuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const caseVariant = plan();
    caseVariant.links[0].studentId = sameUuid;
    caseVariant.links.push({ ...caseVariant.links[0], studentId: sameUuid.toUpperCase(),
      userId: "10000000-0000-4000-8000-000000000003" });
    expect(enrollmentPlanSchema.safeParse(caseVariant).success).toBe(false);
  });
});
