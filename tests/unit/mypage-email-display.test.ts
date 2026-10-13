/**
 * 마이페이지가 내부 주소를 숨기고 실제 이메일만 표시하는지 서버 렌더링으로 확인한다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyPage from "@/app/(member)/mypage/page";

const mocks = vi.hoisted(() => ({ auth: vi.fn<() => Promise<Session | null>>() }));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/(member)/mypage/_components/logout-button", () => ({
  LogoutButton: () => null,
}));

beforeEach(() => {
  mocks.auth.mockReset();
});

async function renderMyPage(email: string) {
  mocks.auth.mockResolvedValue({
    user: {
      id: "11111111-2222-3333-4444-555555555555",
      name: "테스트 회원",
      email,
      role: "MEMBER",
    },
    expires: new Date(Date.now() + 60_000).toISOString(),
  });

  return renderToStaticMarkup(await MyPage());
}

describe("마이페이지 이메일 표시", () => {
  it("카카오 내부 주소는 숨기고 미등록 상태를 알린다", async () => {
    const html = await renderMyPage("kakao_123@oauth.placeholder");

    expect(html).toContain("이메일 미등록");
    expect(html).toContain("소셜 로그인에서 이메일 정보를 제공받지 못했습니다.");
    expect(html).not.toContain("kakao_123@oauth.placeholder");
  });

  it("실제 이메일은 그대로 표시한다", async () => {
    const html = await renderMyPage("member@example.com");

    expect(html).toContain("member@example.com");
    expect(html).not.toContain("이메일 미등록");
  });
});
