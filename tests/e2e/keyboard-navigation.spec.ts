/** #128 공개 페이지의 주요 탐색 요소를 키보드로 조작할 수 있는지 검증합니다. */
import { expect, test } from "@playwright/test";

test("헤더 하위 메뉴를 Tab과 Enter로 이동한다", async ({ page }) => {
  await page.goto("/");
  const header = page.locator("header");
  const intro = header.getByRole("button", { name: "소개" });
  await intro.focus();
  await expect(intro).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(intro).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("Enter");
  await expect(intro).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(header.getByRole("link", { name: "커리큘럼" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/curriculum$/);
});

test("월별 커리큘럼과 FAQ 연락처를 키보드로 연다", async ({ page }) => {
  await page.goto("/curriculum");
  const month = page.getByRole("button", { name: "10월 커리큘럼 상세 보기" });
  await month.focus();
  await expect(page.getByText("전반기 (9월~12월)")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(month).toHaveAttribute("aria-pressed", "false");

  await page.goto("/faq");
  const contact = page.getByRole("button", { name: "담당자 연락처" });
  await contact.focus();
  await page.keyboard.press("Enter");
  await expect(contact).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(contact).toHaveAttribute("aria-expanded", "false");
});

test("달력 버튼에 이름이 있고 홈 제목이 서버 HTML에 포함된다", async ({ page }) => {
  const response = await page.goto("/");
  expect(await response?.text()).toContain("정답보다 중요한 것");
  await expect(page.getByRole("button", { name: "이전 달 보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다음 달 보기" })).toBeVisible();
});
