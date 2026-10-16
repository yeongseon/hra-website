/**
 * 공지 검색의 실제 클라이언트 이동과 브라우저 방문 기록을 검증한다.
 * URL 검색어가 바뀌면 입력도 따라가고, 제출 전 작성 중인 값은 유지되어야 한다.
 * 운영 데이터나 특정 공지에 의존하지 않으며 격리 DB가 연결된 앱에서 실행한다.
 */
import { expect, test, type Page } from "@playwright/test";

const firstQuery = "qa-history-alpha";
const secondQuery = "qa-history-beta";
const draftQuery = "qa-history-writing";

/** 제출한 검색어의 URL과 입력값을 함께 확인한다. */
async function search(page: Page, query: string) {
  const input = page.getByPlaceholder("공지사항 검색...", { exact: true });
  await input.fill(query);
  await input.press("Enter");
  await expect(page).toHaveURL((url) => url.pathname === "/notices" && url.searchParams.get("q") === query);
  await expect(input).toHaveValue(query);
}

/** 매번 새 페이지에서 검색 두 번으로 실제 방문 기록을 만든다. */
async function searchTwice(page: Page) {
  await page.goto("/notices");
  await search(page, firstQuery);
  await search(page, secondQuery);
}

test("정상 검색 후 제출 전 작성 중인 검색어를 보존한다", async ({ page }) => {
  await page.goto("/notices");
  await search(page, firstQuery);
  const input = page.getByPlaceholder("공지사항 검색...", { exact: true });
  await input.fill("");
  await input.pressSequentially(draftQuery);
  await expect(input).toHaveValue(draftQuery);
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === firstQuery);
});

test("검색 두 번 후 뒤로 가면 이전 URL과 검색 입력이 일치한다", async ({ page }) => {
  await searchTwice(page);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === firstQuery);
  await expect(page.getByPlaceholder("공지사항 검색...", { exact: true })).toHaveValue(firstQuery);
});

test("이전 검색에서 작성하다 앞으로 가면 다음 URL의 검색어를 표시한다", async ({ page }) => {
  await searchTwice(page);
  await page.goBack();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === firstQuery);
  const input = page.getByPlaceholder("공지사항 검색...", { exact: true });
  await input.fill(draftQuery);
  await expect(input).toHaveValue(draftQuery);
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === firstQuery);
  await page.goForward();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === secondQuery);
  await expect(input).toHaveValue(secondQuery);
});
