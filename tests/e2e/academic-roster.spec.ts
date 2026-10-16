/**
 * 명부 브라우저 QA. 비로그인 경계는 일반 CI에서 실행한다.
 * 승인자 작업은 격리 DB·활성 등록 기능·HRA_ACADEMIC_QA_STATE(승인자 storageState 파일)와
 * HRA_ACADEMIC_QA_COHORT_ID(시험 기수 UUID)를 준비한 별도 로컬 실행에서 검증한다.
 * 운영 계정이나 운영 DB를 테스트 fixture로 사용하지 않는다.
 */
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

test("비로그인 사용자의 학사 명부 직접 접근은 차단한다", async ({ page }) => {
  await page.goto("/admin/academics/students");
  await expect(page).toHaveURL(/\/login\?/);
  await expect(page.getByRole("heading", { name: "학생 명부" })).toHaveCount(0);
});

const state = process.env.HRA_ACADEMIC_QA_STATE;
const cohort = process.env.HRA_ACADEMIC_QA_COHORT_ID;
if (state && cohort) {
  test.describe("격리 명부 승인자 흐름", () => {
    test.use({ storageState: state });
    test("학생 등록 → 목록 확인 → 동일 학생 중복 거절 → 상태 재조회", async ({ page }) => {
      const name = `명부시험 ${randomUUID().slice(0, 8)}`;
      await page.goto("/admin/academics/students/new");
      await page.getByLabel("표시 이름", { exact: true }).fill(name);
      await page.getByLabel("등록할 기수", { exact: true }).selectOption(cohort);
      await page.getByLabel("본인 확인 방식", { exact: true }).selectOption("IN_PERSON");
      await page.getByLabel("승인 근거 참조 식별자", { exact: true }).fill(randomUUID());
      await page.getByRole("button", { name: "등록 승인" }).click();
      await expect(page.getByRole("heading", { name: "학생 상세" })).toBeVisible();
      const studentUrl = page.url();
      await expect(page.getByText(name, { exact: true })).toBeVisible();
      await page.goto(`/admin/academics/students?cohort=${cohort}`);
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
      await expect(page.locator("tbody tr").filter({ hasText: name })).toContainText("미연결");
      await page.goto(studentUrl);
      await page.getByRole("link", { name: "이 학생을 다른 기수에 등록" }).click();
      await page.getByLabel("등록할 기수", { exact: true }).selectOption(cohort);
      await page.getByLabel("본인 확인 방식", { exact: true }).selectOption("IN_PERSON");
      await page.getByLabel("승인 근거 참조 식별자", { exact: true }).fill(randomUUID());
      await page.getByRole("button", { name: "등록 승인" }).click();
      await expect(page.locator("form").getByRole("alert")).toContainText("이미 해당 기수에 등록");
      await expect(page.locator("form").getByRole("alert")).toContainText(/요청 참조: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/);
      const submittedRequest = await page.locator('input[name="requestId"]').inputValue();
      await expect(page.locator("form").getByRole("alert")).not.toContainText(submittedRequest);
      await expect(page.locator("form").getByRole("alert")).not.toContainText(/SELECT|params:|postgresql:|@/);
      await page.goto(studentUrl);
      await expect(page.getByRole("listitem")).toHaveCount(1);
    });
  });
}
