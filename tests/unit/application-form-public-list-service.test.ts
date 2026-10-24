/**
 * 지원 양식 공개 목록 Service가 Repository 행을 표시 DTO로 제한하는지 확인합니다.
 * 공개 여부·작성일 순서는 격리 PostgreSQL 테스트에서 실제 SQL로 검증합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ find: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/features/applications/public-list/repository", () => ({
  findPublishedApplicationFormRows: mocks.find,
}));

import { listPublishedApplicationForms } from "@/features/applications/public-list/service";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue([]);
});

describe("지원 양식 공개 목록 서비스", () => {
  it("저장소 행의 내부 열을 공개 DTO로 복사하지 않는다", async () => {
    mocks.find.mockResolvedValue([{ id, title: "공개 양식", description: "합성 설명",
      isPublished: true, cohortId: "비표시 기수", questionsRevision: 9,
    }]);
    expect(await listPublishedApplicationForms()).toEqual([{ id, title: "공개 양식", description: "합성 설명" }]);
    expect(mocks.find).toHaveBeenCalledOnce();
  });

  it("공개 행이 없으면 빈 목록을 반환한다", async () => {
    expect(await listPublishedApplicationForms()).toEqual([]);
  });

  it("DB 실패를 빈 목록으로 바꾸지 않고 호출자에게 전달한다", async () => {
    const failure = new Error("합성 조회 실패");
    mocks.find.mockRejectedValueOnce(failure);
    await expect(listPublishedApplicationForms()).rejects.toBe(failure);
  });
});
