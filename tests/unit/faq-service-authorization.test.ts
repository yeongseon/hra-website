/**
 * FAQ 서비스는 Web 액션을 우회한 호출에도 관리자 권한을 확인합니다.
 * 잘못된 주체에서 저장소 조회·변경이 시작되지 않는 경계를 고정합니다.
 */
import { beforeEach, expect, it, vi } from "vitest";

const repository = vi.hoisted(() => ({
  listAdminItems: vi.fn(),
  getActiveContactId: vi.fn(),
}));

vi.mock("@/features/faq/repository", () => repository);

import { listAdminItems, saveContact } from "@/features/faq/service";

beforeEach(() => {
  vi.resetAllMocks();
});

it("관리자가 아닌 목록 호출은 저장소를 열기 전에 거부한다", async () => {
  await expect(listAdminItems({ userId: "member-1", role: "MEMBER" }))
    .rejects.toThrow("FAQ_ADMIN_REQUIRED");
  expect(repository.listAdminItems).not.toHaveBeenCalled();
});

it("관리자가 아닌 연락처 변경은 활성 행을 조회하지 않는다", async () => {
  await expect(saveContact(
    { userId: "member-1", role: "MEMBER" },
    { contactName: "합성 담당자", contactPhone: "000-0000-0000", contactRole: "담당" },
  )).rejects.toThrow("FAQ_ADMIN_REQUIRED");
  expect(repository.getActiveContactId).not.toHaveBeenCalled();
});
