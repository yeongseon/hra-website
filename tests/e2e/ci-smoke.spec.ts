/**
 * 운영 DB·Blob 자격 증명 없이 실행하는 CI 브라우저 스모크 테스트입니다.
 * 로그인·인증 경계·로컬 이미지·보안 헤더를 확인하며 외부 자료를 읽지 않습니다.
 */
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { anonymousProtectedPaths } from "../support/auth-protected-paths";

test("응답 보안 헤더를 유지한다", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toBe("camera=(), microphone=(), geolocation=()");
  expect(headers["content-security-policy"]).toBe("frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'");
  expect(headers["content-security-policy-report-only"]).toContain("default-src 'self'");
});

test("Next 이미지 최적화는 로컬 사진을 변환하고 외부 URL과 SVG를 거부한다", async ({ request }) => {
  const optimized = await request.get("/_next/image", {
    params: { url: "/images/cohort-17.jpeg", w: "640", q: "75" },
  });
  expect(optimized.status()).toBe(200);
  expect(optimized.headers()["content-type"]).toMatch(/^image\//);
  expect(await sharp(await optimized.body()).metadata()).toMatchObject({ width: 640 });

  // 프로젝트 Blob 호스트 밖의 URL과 기본적으로 비허용인 SVG를 격리 서버에서 거부합니다.
  for (const url of ["https://example.invalid/image.png", "/next.svg"]) {
    const denied = await request.get("/_next/image", { params: { url, w: "640", q: "75" } });
    expect(denied.status()).toBe(400);
  }
});

test("정적 OG 이미지는 외부 입력으로 바뀌지 않는 PNG를 반환한다", async ({ request }) => {
  const baseline = await request.get("/opengraph-image");
  expect(baseline.status()).toBe(200);
  const response = await request.get("/opengraph-image", { params: { title: "합성 입력" } });
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  expect(await sharp(await response.body()).metadata()).toMatchObject({ format: "png", width: 1200, height: 630 });
  expect(await response.body()).toEqual(await baseline.body());
});

test("로그인 화면이 정상 응답한다", async ({ page }) => {
  const response = await page.goto("/login");
  expect(response?.status()).toBe(200);
  await expect(page.locator("body")).toContainText("로그인");
});

test("OAuth 설정 오류를 한국어로 안내한다", async ({ page }) => {
  await page.goto("/api/auth/error?error=Configuration");
  await expect(page).toHaveURL(/\/login\?error=Configuration/);
  await expect(page.getByRole("alert").filter({ hasText: "로그인 설정에 문제가 있습니다" }))
    .toContainText("로그인 설정에 문제가 있습니다");
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

for (const path of anonymousProtectedPaths) {
  test(`비로그인 ${path} 접근은 로그인 화면으로 이동한다`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBeLessThan(400);
    expect(page.url()).toMatch(/\/login(\?|$)/);
  });
}
