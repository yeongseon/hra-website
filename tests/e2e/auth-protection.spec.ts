/**
 * 비로그인 접근 차단 회귀 테스트
 *
 * 역할: proxy.ts matcher와 auth.ts authorized 콜백이 보호 영역(/admin, /resources,
 *       /member, /mypage)을 모두 차단하는지 확인한다. 특히 /member/* 는 보고서
 *       양식·가이드 회원 전용 영역이므로 이 회귀 테스트가 보안 게이트 역할을 한다.
 */

import { expect, test } from "@playwright/test";

const protectedPaths = [
  "/admin",
  "/admin/templates",
  "/resources",
  "/member/templates",
  "/member/templates/management-book",
  "/member/templates/management-book/print",
  "/member/guides/report-writing-guide",
  "/mypage",
];

for (const path of protectedPaths) {
  test(`비로그인 사용자가 ${path} 접근 시 로그인 페이지로 이동한다`, async ({
    page,
  }) => {
    const response = await page.goto(path);
    // NextAuth는 미인증 시 로그인 페이지로 리다이렉트하거나 401을 반환한다.
    // 최종 URL이 /login 으로 시작하면 통과로 간주한다.
    expect(page.url()).toMatch(/\/login(\?|$)/);
    // 응답 자체는 200(로그인 페이지)이어야 한다.
    expect(response?.status()).toBeLessThan(400);
  });
}
