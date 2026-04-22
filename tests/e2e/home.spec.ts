/**
 * 공개 홈 화면 스모크 테스트
 *
 * 역할:
 * - 기본 공개 홈 화면이 정상 응답하는지 최소 수준으로 확인합니다.
 * - 향후 핵심 플로우 E2E를 추가할 때 시작점으로 사용합니다.
 */

import { expect, test } from "@playwright/test";

test("홈 화면이 정상적으로 렌더링된다", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/HRA/i);
});
