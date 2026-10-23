/**
 * 공개 기수 Service가 조회 시각을 검증하고 표시용 필드만 Page에 반환하는지 확인합니다.
 * 저장소 결과에 운영 링크·시트 ID가 추가되어도 공개 목록에는 실리지 않아야 합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listVisibleCohortRows: vi.fn() }));
vi.mock("@/features/cohorts/public-list/repository", () => ({ listVisibleCohortRows: mocks.listVisibleCohortRows }));

import { listVisibleCohorts } from "@/features/cohorts/public-list/service";

beforeEach(() => vi.resetAllMocks());

it("유효하지 않은 조회 시각은 저장소 호출 전에 거부한다", async () => {
  await expect(listVisibleCohorts(new Date("invalid"))).rejects.toThrow("유효한 기수 조회 시각");
  expect(mocks.listVisibleCohortRows).not.toHaveBeenCalled();
});

it("표시용 여섯 필드만 반환하고 운영 링크·시트 ID를 제거한다", async () => {
  const asOf = new Date("2026-10-24T00:00:00Z");
  mocks.listVisibleCohortRows.mockResolvedValue([{ name: "20기", startDate: asOf,
    endDate: null, description: "합성 소개", isActive: true, imageUrl: null,
    googleFormUrl: "https://private.invalid/form", googleSheetId: "private-sheet", order: 1 }]);
  expect(await listVisibleCohorts(asOf)).toEqual([{ name: "20기", startDate: asOf,
    endDate: null, description: "합성 소개", isActive: true, imageUrl: null }]);
  expect(mocks.listVisibleCohortRows).toHaveBeenCalledExactlyOnceWith(asOf);
});
