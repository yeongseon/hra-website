/** 지정 승인자의 초안→공개 확인→불변 공개 화면→종료를 실제 격리 앱에서 검증한다. */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("비로그인 과제 관리 직접 접근은 로그인으로 이동한다", async ({ page }) => {
  await page.goto("/admin/academics/assignments");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByRole("heading", { name: "과제 관리", exact: true })).toHaveCount(0);
});

const state = process.env.HRA_ACADEMIC_QA_STATE;
const cohort = process.env.HRA_ACADEMIC_QA_COHORT_ID;
const event = process.env.HRA_ACADEMIC_QA_EVENT_ID;
const session = process.env.HRA_ACADEMIC_QA_SESSION_ID;
if (state && cohort) {
  test.describe("과제 관리 승인자 흐름", () => {
    test.use({ storageState: state });
    test("키보드·모바일에서 초안 수정과 대상 확인을 거쳐 공개·종료한다", async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const title = `과제관리시험 ${randomUUID().slice(0, 8)}`;
      const due = `${new Date(Date.now() + 2 * 86400000 + 9 * 3600000).toISOString().slice(0, 16)}:37`;
      await page.goto("/admin/academics/assignments/new");
      await page.getByLabel("대상 기수", { exact: true }).selectOption(cohort);
      if (event) await page.getByLabel("연결 수업", { exact: true }).selectOption(event);
      if (session) await page.getByLabel("연결 세부 수업", { exact: true }).selectOption(session);
      await page.getByLabel("과제 제목", { exact: true }).fill(title);
      await page.getByLabel("과제 안내", { exact: true }).fill("시험 과제 안내");
      await page.getByLabel("마감 일시 (한국시간)", { exact: true }).fill(due);
      await page.getByRole("button", { name: "초안 저장", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "과제 상세", exact: true })).toBeVisible();
      const detailUrl = page.url();
      await expect(page.getByLabel("마감 일시 (한국시간)", { exact: true })).toHaveValue(due);
      await page.getByLabel("과제 안내", { exact: true }).fill("수정한 시험 과제 안내");
      const saved = page.waitForResponse(response => response.request().method() === "POST" && response.url() === detailUrl);
      await page.getByRole("button", { name: "초안 수정 저장", exact: true }).click();
      await saved;
      await page.reload();
      await expect(page.getByLabel("과제 안내", { exact: true })).toHaveValue("수정한 시험 과제 안내");
      await page.getByRole("link", { name: "공개 대상 확인", exact: true }).click();
      await expect(page.getByRole("heading", { name: "과제 공개 대상 확인", exact: true })).toBeVisible();
      await expect(page.getByText("현재 계정 미연결 대상", { exact: true })).toBeVisible();
      await expect(page.getByText(/공개 후 새로 등록한 학생은 이 과제에 자동 추가되지 않습니다/)).toBeVisible();
      const publishConfirmation = page.getByRole("checkbox");
      await publishConfirmation.focus();
      await page.keyboard.press("Space");
      await page.getByRole("button", { name: "확인한 대상으로 공개", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByText(/과제가 공개되었습니다\.|현재 상태: 공개/).first()).toBeVisible();
      await page.goto(detailUrl);
      await expect(page.getByRole("textbox")).toHaveCount(0);
      await expect(page.getByText("수정한 시험 과제 안내", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /저장|삭제/ })).toHaveCount(0);
      // 서버 확정 뒤 첫 응답만 잃는 통신 오류를 재현하고 같은 요청으로 종료를 재시도한다.
      let loseCloseResponse = true;
      await page.route(detailUrl, async route => {
        if (loseCloseResponse && route.request().method() === "POST") {
          loseCloseResponse = false;
          const response = await route.fetch();
          if (response.ok()) await route.abort("failed");
          else await route.fulfill({ response });
        } else await route.continue();
      });
      await page.locator("form").getByRole("checkbox").check();
      await page.getByRole("button", { name: "과제 종료", exact: true }).click();
      await expect(page.locator("form").getByRole("alert")).toContainText("같은 화면에서 다시 시도");
      await expect(page.locator("form").getByRole("checkbox")).toBeChecked();
      await page.getByRole("button", { name: "과제 종료", exact: true }).click();
      await expect(page.getByText("종료된 과제입니다. 학생의 추가 제출을 받지 않습니다.", { exact: true })).toBeVisible();
      await page.unroute(detailUrl);
      await page.reload();
      await expect(page.getByRole("button", { name: "과제 종료", exact: true })).toHaveCount(0);
      await page.goto(`/admin/academics/assignments?cohort=${cohort}&status=CLOSED`);
      const row = page.locator("tbody tr").filter({ hasText: title });
      await expect(row).toContainText("종료");
      await expect(row.getByRole("link", { name: title, exact: true })).toBeVisible();
    });
  });
}
