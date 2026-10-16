/** 운영 DB·Blob 없이 제출 현황의 실제 비로그인 페이지·내보내기 경계를 확인한다. */
import { expect, test } from "@playwright/test";
const assignmentId = "00000000-0000-4000-8000-000000000001";

test("비로그인 과제 제출 현황은 로그인으로 이동하고 학생 정보를 표시하지 않는다", async ({ page }) => {
  await page.goto(`/admin/academics/assignments/${assignmentId}/submissions`);
  await expect(page).toHaveURL(/\/login(\?|$)/);
  await expect(page.getByRole("table")).toHaveCount(0);
});

test("비로그인 CSV 직접 호출은 첨부파일과 제출자 정보 없이 거부한다", async ({ request }) => {
  const response = await request.get(`/api/academic/assignments/${assignmentId}/submissions/export`);
  expect(response.status()).toBe(403);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  expect(response.headers()["content-disposition"]).toBeUndefined();
  expect(await response.json()).toEqual({ message: "지정된 학사 운영 책임자만 조회할 수 있습니다." });
});
