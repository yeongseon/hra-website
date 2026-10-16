/** 실제 Next 세션·DB 조회를 사용하는 학생 UI 회귀다. 공급자 업로드는 명시된 별도 QA에서만 실행한다. */
import { readFileSync, writeFileSync } from "node:fs";
import { resourceQaPdfBytes } from "../support/resource-qa-pdf.mjs";
import { expect, test, type Page } from "@playwright/test";

// 실제 공급자 의도를 브라우저에 전달하기 전에 이 실행 원장에만 기록한다.
async function recordIssuedUploads(page: Page, onIssued?: (pathname: string) => void) {
  // 발급 응답을 브라우저에 전달하기 전에 키·만료 원장을0600파일에 기록한다.
  await page.route("**/api/academic/uploads/intents", async route => {
    const response = await route.fetch();
    if (response.ok()) {
      const issued = await response.json();
      if (typeof issued.pathname !== "string" || !/^academic-uploads\/v1\/[a-f0-9-]{36}\/document\.pdf$/.test(issued.pathname)
        || typeof issued.expiresAt !== "string" || !Number.isFinite(Date.parse(issued.expiresAt))) throw new Error("QA 발급 원장을 확인하지 못했습니다.");
      const path = process.env.HRA_ACADEMIC_UI_MANIFEST_PATH;
      if (!path) throw new Error("QA 원장 경로가 없습니다.");
      const manifest = JSON.parse(readFileSync(path, "utf8"));
      if (!manifest.objects.some((record: { pathname: string }) => record.pathname === issued.pathname)) manifest.objects.push({ pathname: issued.pathname, expiresAt: issued.expiresAt });
      writeFileSync(path, JSON.stringify(manifest), { mode: 0o600 });
      onIssued?.(issued.pathname);
    }
    await route.fulfill({ response });
  });
}

test("비로그인 내 과제는 로그인 화면으로 이동한다", async ({ page }) => {
  await page.goto("/member/assignments"); await expect(page).toHaveURL(/\/login(\?|$)/);
});

test.describe("격리 PostgreSQL 학생 화면", () => {
  test.skip(process.env.HRA_ACADEMIC_UI_QA !== "true", "전용 격리 QA 실행기가 합성 계정과 과제를 준비한다.");
  test.beforeEach(async ({ page, baseURL }) => {
    // 공개 로그인 화면은 소셜 전용이므로 합성 계정도 실제 credentials API를 통과시킨다.
    const csrf = await (await page.request.get("/api/auth/csrf")).json();
    await page.request.post("/api/auth/callback/credentials", { form: { csrfToken: csrf.csrfToken,
      email: process.env.HRA_ACADEMIC_UI_EMAIL ?? "", password: process.env.HRA_ACADEMIC_UI_PASSWORD ?? "", callbackUrl: `${baseURL}/member/assignments` },
      headers: { Origin: baseURL ?? "", "X-Auth-Return-Redirect": "1" }, maxRedirects: 0 });
    const session = await (await page.request.get("/api/auth/session")).json();
    expect(session.user?.role).toBe("MEMBER");
  });
  test("실제 로그인→목록→최종 결과→새로고침은 같은 ID·시각·인증 다운로드를 보여준다", async ({ page }) => {
    await page.goto("/member/assignments"); await expect(page.getByRole("heading", { name: "내 과제", exact: true })).toBeVisible();
    await page.getByRole("link", { name: "완료 결과 시험", exact: true }).click();
    await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toBeVisible();
    const link = page.getByRole("link", { name: "제출.pdf 다운로드" }); const href = await link.getAttribute("href");
    expect(href).toMatch(/^\/api\/academic\/submissions\/[a-f0-9-]+\/file\/[a-f0-9-]+$/);
    const time = await page.getByText(/^제출 시각:/).textContent();
    await page.reload(); await expect(page.getByRole("link", { name: "제출.pdf 다운로드" })).toHaveAttribute("href", href ?? "");
    await expect(page.getByText(/^제출 시각:/)).toHaveText(time ?? "");
    await expect(page.getByLabel("제출할 PDF 파일")).toHaveCount(0);
  });
  test("모바일 파일 오류는 선택 파일과 접근 가능한 상태 안내를 보존한다", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/member/assignments/${process.env.HRA_ACADEMIC_UI_OPEN_ID}`);
    await page.getByLabel("제출할 PDF 파일").setInputFiles({ name: "빈.pdf", mimeType: "application/pdf", buffer: Buffer.alloc(0) });
    await page.getByRole("button", { name: "최종 제출", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("50MiB"); await expect(page.getByText("선택한 파일: 빈.pdf")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByLabel("제출할 PDF 파일").focus(); await expect(page.getByLabel("제출할 PDF 파일")).toBeFocused();
  });
  test("업로드 비활성 서버 오류는 실제 응답 참조를 live 영역에 표시한다",async({page})=>{
    test.skip(process.env.HRA_ACADEMIC_UI_PROVIDER_QA==="true","쓰기 비활성 격리 QA 전용입니다.");
    await page.goto(`/member/assignments/${process.env.HRA_ACADEMIC_UI_OPEN_ID}`);
    await page.getByLabel("제출할 PDF 파일").setInputFiles({name:"참조시험.pdf",mimeType:"application/pdf",buffer:resourceQaPdfBytes()});
    const failure=page.waitForResponse(response=>response.request().method()==="POST" && response.url().endsWith("/api/academic/uploads/intents"));
    await page.getByRole("button",{name:"최종 제출",exact:true}).click();
    const response=await failure;expect(response.status()).toBe(404);
    const body=await response.json();expect(body.referenceId).toBe(response.headers()["x-request-id"]);
    await expect(page.getByRole("status")).toContainText(`요청 참조: ${body.referenceId}`);
    await expect(page.getByRole("status")).toHaveAttribute("aria-live","polite");
    await expect(page.getByRole("status")).not.toContainText(/SELECT|params:|postgresql:|@/);
  });
  test("실제 비공개 업로드·최종화 응답 유실·같은 요청 복구·새로고침", async ({ page }) => {
    test.setTimeout(180000);
    test.skip(process.env.HRA_ACADEMIC_UI_PROVIDER_QA !== "true", "실제 공급자 자격 증명과 QA 객체 정리 권한이 필요하다.");
    await page.goto(`/member/assignments/${process.env.HRA_ACADEMIC_UI_UPLOAD_ID}`);
    await recordIssuedUploads(page);
    let dropped = false;
    await page.route("**/member/assignments/*", async route => {
      if (!dropped && route.request().method() === "POST" && route.request().headers()["next-action"]) {
        dropped = true; await route.fetch(); await route.abort("failed");
      } else await route.continue();
    });
    await page.getByLabel("제출할 PDF 파일").setInputFiles({ name: "실제시험.pdf", mimeType: "application/pdf", buffer: resourceQaPdfBytes() });
    await page.getByRole("button", { name: "최종 제출", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("같은 요청", { timeout: 120000 });
    await expect(page.getByText("선택한 파일: 실제시험.pdf")).toBeVisible();
    await page.getByRole("button", { name: "같은 요청으로 제출 다시 확인" }).click();
    await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toBeVisible({ timeout: 120000 });
    const href = await page.getByRole("link", { name: "실제시험.pdf 다운로드" }).getAttribute("href");
    await page.reload(); await expect(page.getByRole("link", { name: "실제시험.pdf 다운로드" })).toHaveAttribute("href", href ?? "");
  });
  test("위장 PDF는 서버 거부 뒤 취소하고 정상 파일을 새 의도로 다시 제출한다", async ({ page }) => {
    test.setTimeout(240000);
    test.skip(process.env.HRA_ACADEMIC_UI_PROVIDER_QA !== "true", "실제 공급자 자격 증명과 QA 객체 정리 권한이 필요하다.");
    await page.goto(`/member/assignments/${process.env.HRA_ACADEMIC_UI_REPLACEMENT_ID}`);
    let firstUploadPath: string | null = null;
    let rejectedPut = false;
    await recordIssuedUploads(page, pathname => { firstUploadPath ??= pathname; });
    // 설치된 SDK의 제어 주소에 첫 발급 파일의 PUT 한 건만 실패시킨다. 토큰 POST와 다른 객체는 통과한다.
    await page.route(url => url.origin === "https://vercel.com" && (url.pathname === "/api/blob/" || url.pathname === "/api/blob")
      && firstUploadPath !== null && url.searchParams.get("pathname") === firstUploadPath, async route => {
      if (!rejectedPut && route.request().method() === "PUT") {
        rejectedPut = true;
        await route.fulfill({ status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ error: { code: "bad_request", message: "시험 전송을 완료하지 못했습니다." } }) });
      } else await route.continue();
    });
    await page.getByLabel("제출할 PDF 파일").setInputFiles({ name: "첫전송.pdf", mimeType: "application/pdf", buffer: resourceQaPdfBytes() });
    await page.getByRole("button", { name: "최종 제출", exact: true }).click();
    // 주입이 실행되지 않으면 상태 안내를 기다리기 전에 독립된 고정 오류로 실패한다.
    await expect.poll(() => rejectedPut, { timeout: 15000, message: "시험 PUT 실패 주입이 실행되어야 합니다." }).toBe(true);
    await expect(page.getByRole("status")).toContainText("같은 요청", { timeout: 30000 });
    await expect(page.getByText("선택한 파일: 첫전송.pdf")).toBeVisible();
    await page.getByRole("button", { name: "업로드 취소 후 다시 시작" }).click();
    await expect(page.getByRole("status")).toContainText("기존 업로드를 취소했습니다");
    await expect(page.getByText("선택한 파일: 첫전송.pdf")).toBeVisible();
    // 실제 요청 한도 창을 기다린 뒤 같은 대상으로 다음 업로드를 수행한다.
    await page.waitForTimeout(61000);
    await page.getByLabel("제출할 PDF 파일").setInputFiles({ name: "위장.pdf", mimeType: "application/pdf", buffer: Buffer.from("This is not a PDF fixture") });
    await page.getByRole("button", { name: "최종 제출", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("PDF 파일 한 개", { timeout: 120000 });
    await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "업로드 취소 후 다시 시작" }).click();
    await expect(page.getByRole("status")).toContainText("기존 업로드를 취소했습니다");
    await expect(page.getByLabel("제출할 PDF 파일")).toBeEnabled();
    // 실제4회/60초 요청 제한을 우회하지 않고 검증된 기존 창이 만료된 뒤 다시 전송한다.
    await page.waitForTimeout(61000);
    await page.getByLabel("제출할 PDF 파일").setInputFiles({ name: "정상교체.pdf", mimeType: "application/pdf", buffer: resourceQaPdfBytes() });
    await page.getByRole("button", { name: "최종 제출", exact: true }).click();
    await expect(page.getByRole("heading", { name: "제출 완료", exact: true })).toBeVisible({ timeout: 120000 });
    const href = await page.getByRole("link", { name: "정상교체.pdf 다운로드" }).getAttribute("href");
    await page.reload(); await expect(page.getByRole("link", { name: "정상교체.pdf 다운로드" })).toHaveAttribute("href", href ?? "");
    const path = process.env.HRA_ACADEMIC_UI_MANIFEST_PATH;
    if (!path) throw new Error("QA 원장 경로가 없습니다.");
    const records = JSON.parse(readFileSync(path, "utf8")).objects;
    expect(records.length >= 4).toBe(true);
    expect(records.at(-1).pathname !== records.at(-2).pathname).toBe(true);
  });

});
