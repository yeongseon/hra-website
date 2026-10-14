/**
 * 이전 양식 관리 경로가 관리자 인가 후 단일 자료실 경로로 이동하는지 확인합니다 (#130).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("@/lib/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));

import LegacyListPage from "@/app/(admin)/admin/templates/page";
import LegacyNewPage from "@/app/(admin)/admin/templates/new/page";
import LegacyEditPage from "@/app/(admin)/admin/templates/[id]/edit/page";

const id = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ user: { role: "ADMIN" } });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
  mocks.notFound.mockImplementation(() => { throw new Error("NOT_FOUND"); });
});

describe("이전 양식 관리 경로", () => {
  it("목록·생성·수정을 자료실의 단일 화면으로 안내한다", async () => {
    await expect(LegacyListPage()).rejects.toThrow("REDIRECT:/admin/resources/templates");
    await expect(LegacyNewPage()).rejects.toThrow("REDIRECT:/admin/resources/templates/new");
    await expect(LegacyEditPage({ params: Promise.resolve({ id }) }))
      .rejects.toThrow(`REDIRECT:/admin/resources/templates/${id}/edit`);
    expect(mocks.requireAdmin).toHaveBeenCalledTimes(3);
  });

  it("잘못된 수정 ID는 새 경로로 전달하지 않는다", async () => {
    await expect(LegacyEditPage({ params: Promise.resolve({ id: "invalid" }) }))
      .rejects.toThrow("NOT_FOUND");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
