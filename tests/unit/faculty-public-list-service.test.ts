/**
 * 교수진 Application Service가 저장소 구현 변경에도 공개 표시 필드만 전달하는지 확인합니다.
 * 원본 DB 행의 감사 시각·추가 열은 Page 경계에 실리지 않습니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ listFacultyRows: vi.fn() }));
vi.mock("@/features/faculty/public-list/repository", () => ({ listFacultyRows: mocks.listFacultyRows }));

import { listPublicFaculty } from "@/features/faculty/public-list/service";

beforeEach(() => vi.resetAllMocks());

it("저장소에 여분의 열이 있어도 일곱 공개 필드만 반환한다", async () => {
  mocks.listFacultyRows.mockResolvedValue([{ id: "one", name: "합성 교수", category: "CLASSICS",
    currentPosition: "현직", formerPosition: null, imageUrl: null, order: 1,
    createdAt: new Date(), updatedAt: new Date(), internalMemo: "비공개" }]);
  expect(await listPublicFaculty()).toEqual([{ id: "one", name: "합성 교수", category: "CLASSICS",
    currentPosition: "현직", formerPosition: null, imageUrl: null, order: 1 }]);
});
