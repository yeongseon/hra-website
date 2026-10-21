// @vitest-environment node
/**
 * 공개·회원 레이아웃이 실제 Header 요소에 전달하는 세션 props를 검증합니다.
 * 이름·이메일·역할만 허용하고 세션의 내부 식별자·버전·미래 필드가 따라가지 않게 합니다.
 * 실제 회원 인가와 Header 렌더링을 유지해 역할별 메뉴와 로그인 이동도 함께 확인합니다.
 */
import { Children, isValidElement, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Session } from "next-auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn<() => Promise<Session | null>>(), redirect: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", redirect: mocks.redirect }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/components/layout/footer", () => ({ Footer: () => null }));

import PublicLayout from "@/app/(public)/layout";
import MemberLayout from "@/app/(member)/layout";
import { Header } from "@/components/layout/header";

type Role = Session["user"]["role"];
type HeaderElement = ReactElement<ComponentProps<typeof Header>>;

// 현재와 미래의 불필요 필드를 섞은 합성 세션으로 allowlist의 실제 동작을 확인합니다.
function makeSession(role: Role) {
  return {
    user: {
      id: "10000000-0000-4000-8000-000000000001",
      name: "합성 회원", email: "member@example.com", role,
      image: "/qa/internal-avatar.png", sessionVersion: 731,
      futureUserField: "사용자 내부 값",
    },
    expires: "2099-01-01T00:00:00.000Z",
    futureSessionField: "세션 내부 값",
  };
}

// 레이아웃을 실행한 React 트리에서 Header를 찾아 타입 선언이 아닌 실제 props를 읽습니다.
function findHeader(node: ReactNode): HeaderElement | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === Header && isValidElement<ComponentProps<typeof Header>>(node)) return node;
  return Children.toArray(node.props.children).map(findHeader).find((element) => element !== undefined);
}

function requireHeader(node: ReactNode): HeaderElement {
  const header = findHeader(node);
  expect(header).toBeDefined();
  if (!header) throw new Error("레이아웃의 Header를 찾지 못했습니다.");
  return header;
}

// 응답 필드와 기존 메뉴 권한을 함께 검사해 props 축소가 표시 정책을 바꾸지 않게 합니다.
function expectMinimalSession(header: HeaderElement, session: ReturnType<typeof makeSession>) {
  expect(header.props.session).toStrictEqual({
    user: { name: session.user.name, email: session.user.email, role: session.user.role },
  });
  expect(header.props.session).not.toBe(session);
  const html = renderToStaticMarkup(header);
  expect(html.includes('href="/resources"')).toBe(session.user.role !== "PENDING");
  expect(html.includes('href="/admin"')).toBe(session.user.role === "ADMIN");
  expect(html).toContain(session.user.name);
  // 매핑 때문에 서버에서 사용하던 인증 세션 자체가 변하지 않아야 합니다.
  expect(session).toStrictEqual(makeSession(session.user.role));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`REDIRECT:${path}`); });
});

describe("Header에 전달하는 최소 세션", () => {
  it.each(["PENDING", "MEMBER", "FACULTY", "ADMIN"] as const)("공개 레이아웃의 %s 세션은 허용 필드만 전달한다", async (role) => {
    const session = makeSession(role);
    mocks.auth.mockResolvedValue(session);
    expectMinimalSession(requireHeader(await PublicLayout({ children: null })), session);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it.each(["MEMBER", "FACULTY", "ADMIN"] as const)("회원 레이아웃의 %s 세션도 같은 표시 필드만 전달한다", async (role) => {
    const session = makeSession(role);
    mocks.auth.mockResolvedValue(session);
    expectMinimalSession(requireHeader(await MemberLayout({ children: null })), session);
    expect(mocks.auth).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("공개 비로그인 상태는 null과 로그인 메뉴를 유지한다", async () => {
    mocks.auth.mockResolvedValue(null);
    const header = requireHeader(await PublicLayout({ children: null }));
    expect(header.props.session).toBeNull();
    const html = renderToStaticMarkup(header);
    expect(html).toContain('href="/login"');
    expect(html).not.toContain('href="/resources"');
    expect(html).not.toContain('href="/admin"');
  });

  it("이름·이메일의 기존 null 값을 다른 문자열로 바꾸지 않는다", async () => {
    mocks.auth.mockResolvedValue({ ...makeSession("MEMBER"), user: { ...makeSession("MEMBER").user, name: null, email: null } });
    const header = requireHeader(await PublicLayout({ children: null }));
    expect(header.props.session).toStrictEqual({ user: { name: null, email: null, role: "MEMBER" } });
  });

  it("회원 레이아웃은 PENDING을 기존 대기 페이지로 이동시킨다", async () => {
    mocks.auth.mockResolvedValue(makeSession("PENDING"));
    await expect(MemberLayout({ children: null })).rejects.toThrow("REDIRECT:/pending");
    expect(mocks.redirect).toHaveBeenCalledWith("/pending");
  });

  it("회원 레이아웃은 비로그인 사용자를 기존 로그인 페이지로 이동시킨다", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(MemberLayout({ children: null })).rejects.toThrow("REDIRECT:/login");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
  });
});
