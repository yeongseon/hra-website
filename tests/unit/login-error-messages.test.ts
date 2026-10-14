/**
 * OAuth 실패 코드가 로그인 화면에서 한국어 안내로 표시되는지 확인합니다 (#130).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ error: null as string | null }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(mocks.error ? { error: mocks.error } : {}),
}));
vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { LoginForm } from "@/app/(auth)/login/login-form";

function renderError(error: string) {
  mocks.error = error;
  return renderToStaticMarkup(createElement(LoginForm, {
    enabledProviders: { google: false, kakao: true },
  }));
}

describe("로그인 오류 안내", () => {
  it("계정 연결·접근 거부·서버 설정 오류를 각각 한국어로 안내한다", () => {
    expect(renderError("OAuthAccountNotLinked")).toContain("기존에 사용하던 로그인 방법");
    expect(renderError("AccessDenied")).toContain("로그인이 허용되지 않았습니다");
    expect(renderError("Configuration")).toContain("로그인 설정에 문제가 있습니다");
  });

  it("알 수 없는 오류에도 한국어 안내를 표시한다", () => {
    expect(renderError("OAuthCallback")).toContain("로그인 중 오류가 발생했습니다");
  });
});
