/**
 * 운영 DB·Blob 자격 증명 없이 실행하는 CI 브라우저 스모크 테스트입니다.
 * 정적 로그인 화면과 인증 경계만 확인하여 격리 환경에서도 외부 자료를 읽지 않습니다.
 */
import { expect, test } from "@playwright/test";

test("로그인 화면이 정상 응답한다", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toContainText("로그인");
});

test("관리자 로그인 화면이 정상 응답한다", async ({ page }) => {
  const response = await page.goto("/admin/login");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toContainText("관리자 로그인");
});

test("소개 화면에 실제 활동 사진이 보이고 이미지 자리 문구가 없다", async ({ page }) => {
  const response = await page.goto("/about");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("img", { name: "HRA 17기 구성원 단체 사진" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("이미지 영역");
  await expect(page.locator("body")).not.toContainText("HRA 활동 사진");
});

for (const path of ["/admin", "/admin/templates", "/admin/resources/templates", "/admin/users", "/resources", "/mypage"]) {
  test(`비로그인 ${path} 접근은 로그인 화면으로 이동한다`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    expect(page.url()).toMatch(/\/login(\?|$)/);
  });
}
