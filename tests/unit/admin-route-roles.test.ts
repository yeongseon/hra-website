/**
 * 관리자 주요 경로의 페이지 진입 인가 회귀 테스트입니다 (#123).
 * 레이아웃 외에 페이지 자체도 관리자 역할을 확인하는지 검증합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn(), select: vi.fn() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/app/(admin)/admin/recruitment-settings/_components/recruitment-settings-client", () => ({
  RecruitmentSettingsClient: () => null,
}));

import AdminDashboardPage from "@/app/(admin)/admin/page";
import AdminDocsPage from "@/app/(admin)/admin/docs/page";
import AdminRecruitmentSettingsPage from "@/app/(admin)/admin/recruitment-settings/page";

const adminRoutes = [
  { path: "/admin", run: () => AdminDashboardPage() },
  { path: "/admin/docs", run: () => AdminDocsPage() },
  { path: "/admin/recruitment-settings", run: () => AdminRecruitmentSettingsPage() },
];

describe("관리자 역할 × 경로", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
    mocks.select.mockImplementation(() => { throw new Error("DB_ACCESSED"); });
  });

  it.each(["PENDING", "MEMBER", "FACULTY", "ADMIN"])(
    "%s 역할의 관리자 페이지 접근을 검증한다",
    async (role) => {
      mocks.auth.mockResolvedValue({ user: { id: "user", role } });
      for (const route of adminRoutes) {
        if (role === "ADMIN") {
          await expect(route.run(), route.path).resolves.toBeTruthy();
        } else {
          await expect(route.run(), route.path).rejects.toThrow("REDIRECT:/login");
        }
      }
      if (role !== "ADMIN") expect(mocks.select).not.toHaveBeenCalled();
    },
  );
});
