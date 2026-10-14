/**
 * 회원 경로의 역할별 서버 인가 회귀 테스트입니다 (#123).
 * 승인 대기는 데이터 조회보다 먼저 차단하고 승인 역할은 조회 단계까지 도달해야 합니다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(),
  resolveGuide: vi.fn(),
  resolveTemplate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
  notFound: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: new Proxy({}, { get: () => { throw new Error("DB_ACCESSED"); } }),
}));
vi.mock("@/lib/markdown/resolve", () => ({
  resolveGuide: mocks.resolveGuide,
  resolveTemplate: mocks.resolveTemplate,
}));

import MemberLayout from "@/app/(member)/layout";
import MyPage from "@/app/(member)/mypage/page";
import ResourcesPage from "@/app/(member)/resources/page";
import ClassMaterialViewerPage from "@/app/(member)/resources/class-materials/[id]/page";
import MemberGuideDetailPage, {
  generateMetadata as guideMetadata,
} from "@/app/(member)/member/guides/[slug]/page";
import MemberTemplateDetailPage, {
  generateMetadata as templateMetadata,
} from "@/app/(member)/member/templates/[slug]/page";
import MemberTemplatePrintPage from "@/app/(member)/member/templates/[slug]/print/page";
import { requireMember } from "@/lib/member";

const slugParams = Promise.resolve({ slug: "sample" });
const idParams = Promise.resolve({ id: "11111111-1111-4111-8111-111111111111" });
const memberRoutes = [
  { path: "/mypage", run: () => MyPage(), reachesDb: false },
  { path: "/resources", run: () => ResourcesPage(), reachesDb: true },
  { path: "/resources/class-materials/id", run: () => ClassMaterialViewerPage({ params: idParams }), reachesDb: true },
  { path: "/member/guides/sample", run: () => MemberGuideDetailPage({ params: slugParams }), reachesDb: false },
  { path: "/member/templates/sample", run: () => MemberTemplateDetailPage({ params: slugParams }), reachesDb: false },
  { path: "/member/templates/sample/print", run: () => MemberTemplatePrintPage({ params: slugParams }), reachesDb: false },
  { path: "/member/guides/sample 메타데이터", run: () => guideMetadata({ params: slugParams }), reachesDb: false },
  { path: "/member/templates/sample 메타데이터", run: () => templateMetadata({ params: slugParams }), reachesDb: false },
];

describe("회원 역할 × 경로", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
    mocks.resolveGuide.mockResolvedValue({ title: "가이드", version: 1, body: "본문" });
    mocks.resolveTemplate.mockResolvedValue({ title: "양식", version: 1, slug: "sample", body: "본문" });
  });

  it("비로그인 사용자는 로그인 페이지로 이동한다", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requireMember()).rejects.toThrow("REDIRECT:/login");
  });

  it.each(["PENDING", "MEMBER", "FACULTY", "ADMIN"])(
    "%s 역할에 동일한 회원 경로 정책을 적용한다",
    async (role) => {
      mocks.auth.mockResolvedValue({ user: { id: "user", role, name: "회원" } });
      if (role === "PENDING") {
        await expect(requireMember()).rejects.toThrow("REDIRECT:/pending");
        await expect(MemberLayout({ children: null })).rejects.toThrow("REDIRECT:/pending");
      } else {
        await expect(requireMember()).resolves.toMatchObject({ user: { role } });
        await expect(MemberLayout({ children: null })).resolves.toBeTruthy();
      }

      for (const route of memberRoutes) {
        if (role === "PENDING") {
          await expect(route.run(), route.path).rejects.toThrow("REDIRECT:/pending");
        } else if (route.reachesDb) {
          await expect(route.run(), route.path).rejects.toThrow("DB_ACCESSED");
        } else {
          await expect(route.run(), route.path).resolves.toBeTruthy();
        }
      }
      if (role === "PENDING") {
        expect(mocks.resolveGuide).not.toHaveBeenCalled();
        expect(mocks.resolveTemplate).not.toHaveBeenCalled();
      }
    },
  );
});
