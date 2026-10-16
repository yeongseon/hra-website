/** 홈 달력의 실제 경계 폭과 월 이동·날짜 선택 동작을 브라우저에서 검증한다. */
import { expect, test } from "@playwright/test";

for (const width of [390, 768, 800, 1024, 1280]) {
  test(`홈 달력이 ${width}px에서 넘치지 않고 날짜 탐색을 유지한다`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/?year=2030&month=5");
    const calendar = page.getByRole("heading", { name: "HRA 일정", exact: true }).locator("xpath=ancestor::section");
    const month = calendar.getByRole("heading", { name: "2030년 5월", exact: true });
    await expect(month).toBeVisible();
    await calendar.getByRole("button", { name: "10", exact: true }).click();
    await expect(calendar.getByText(/^5월 10일 /)).toBeVisible();
    const geometry = await calendar.evaluate((section) => ({
      viewport: document.documentElement.clientWidth,
      content: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      buttonsWithinViewport: [...section.querySelectorAll("button")].every((button) => {
        const bounds = button.getBoundingClientRect();
        return bounds.left >= -1 && bounds.right <= document.documentElement.clientWidth + 1;
      }),
    }));
    expect(geometry.content).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.buttonsWithinViewport).toBe(true);

    await calendar.getByRole("button", { name: "다음 달 보기" }).click();
    await expect(calendar.getByRole("heading", { name: "2030년 6월", exact: true })).toBeVisible();
    await calendar.getByRole("button", { name: "이전 달 보기" }).click();
    await expect(month).toBeVisible();
    await calendar.getByRole("button", { name: "오늘", exact: true }).click();
    await expect(calendar.getByRole("button", { name: "오늘", exact: true })).toBeDisabled();
  });
}
