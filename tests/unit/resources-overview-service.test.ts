/**
 * 자료실 통합 service가 승인 전 DB 접근을 막고 공개 props만 반환하는지 확인합니다.
 * 저장소 결과에 섞인 본문·파일 URL은 service 경계에서 제거해야 합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  loadResourcesOverviewRows: vi.fn(),
}));

vi.mock("@/features/users/me/service", () => ({ getCurrentProfile: mocks.getCurrentProfile }));
vi.mock("@/features/resources/overview/repository", () => ({
  loadResourcesOverviewRows: mocks.loadResourcesOverviewRows,
}));

import { getResourcesOverview } from "@/features/resources/overview/service";

const id = "74000000-0000-4000-8000-000000000001";
const now = new Date("2026-10-24T09:00:00.000Z");
const principal = { userId: id, role: "MEMBER" as const };
const rows = {
  cohorts: [{ id, name: "20기", googleSheetId: "내부 시트" }],
  logs: [{ id, title: "수업일지", classDate: now, createdAt: now, authorName: "합성 작성자", cohortId: id, content: "내부 본문" }],
  weeklyTexts: [{ id, title: "주차 텍스트", hasBody: true, hasFile: false, classDate: now, createdAt: now, cohortId: id, textType: null, body: "내부 본문", fileUrl: "private://secret" }],
  classMaterials: [{ id, title: "강의자료", classDate: now, createdAt: now, audience: "STUDENT", weekNumber: 1, lectureTitle: null, uploaderName: "합성 교수", fileUrl: "private://material" }],
  guidebooks: [{ id, title: "가이드북", createdAt: now, fileUrl: "private://guidebook", fileName: "secret.pdf" }],
  templates: [{ id, slug: "sample", title: "양식", category: "template", createdAt: now, body: "내부 본문" }],
};

beforeEach(() => vi.resetAllMocks());

it("잘못된 주체와 PENDING 세션은 현재 계정 조회 전 차단한다", async () => {
  expect(await getResourcesOverview({ userId: "bad-id", role: "MEMBER" })).toEqual({ kind: "unauthenticated" });
  expect(await getResourcesOverview({ userId: id, role: "PENDING" })).toEqual({ kind: "forbidden" });
  expect(mocks.getCurrentProfile).not.toHaveBeenCalled();
  expect(mocks.loadResourcesOverviewRows).not.toHaveBeenCalled();
});

it("삭제·역할 철회로 현재 프로필이 없으면 자료를 읽지 않는다", async () => {
  mocks.getCurrentProfile.mockResolvedValue(null);
  expect(await getResourcesOverview(principal)).toEqual({ kind: "unauthenticated" });
  expect(mocks.loadResourcesOverviewRows).not.toHaveBeenCalled();
});

it("현재 역할이 승인되지 않았다면 목록을 읽지 않는다", async () => {
  mocks.getCurrentProfile.mockResolvedValue({ id, role: "PENDING", cohortId: id });
  expect(await getResourcesOverview(principal)).toEqual({ kind: "forbidden" });
  expect(mocks.loadResourcesOverviewRows).not.toHaveBeenCalled();
});

it.each(["ADMIN", "FACULTY", "MEMBER"] as const)("현재 %s는 검증된 역할로만 목록을 조회한다", async (role) => {
  mocks.getCurrentProfile.mockResolvedValue({ id, role, cohortId: id });
  mocks.loadResourcesOverviewRows.mockResolvedValue(rows);

  const result = await getResourcesOverview({ userId: id, role });
  expect(result.kind).toBe("ok");
  expect(mocks.loadResourcesOverviewRows).toHaveBeenCalledExactlyOnceWith({ id, role });
  if (result.kind !== "ok") throw new Error("합성 권한 결과 오류");
  expect(result.role).toBe(role);
  expect(result.userCohortId).toBe(id);
  expect(result.weeklyTexts[0]).toMatchObject({ hasBody: true, hasFile: false });
  expect(Object.keys(result.weeklyTexts[0])).toEqual([
    "id", "title", "hasBody", "hasFile", "classDate", "createdAt", "cohortId", "textType",
  ]);
  expect(Object.keys(result.guidebooks[0])).toEqual(["id", "title", "createdAt"]);
  expect(JSON.stringify(result)).not.toMatch(/private:|secret\.pdf|googleSheetId|"body"/);
});

it("저장소 장애를 권한 거부나 빈 목록으로 위장하지 않는다", async () => {
  mocks.getCurrentProfile.mockResolvedValue({ id, role: "MEMBER", cohortId: id });
  const failure = new Error("synthetic database failure");
  mocks.loadResourcesOverviewRows.mockRejectedValue(failure);
  await expect(getResourcesOverview(principal)).rejects.toBe(failure);
});
