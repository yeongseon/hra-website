/**
 * 실제 RichTextEditor를 격리 Vite fixture와 Chromium으로 실행해 미리보기의 키보드 계약을 검증합니다.
 * Next 프로덕션 경로를 추가하지 않고 환경 파일·DB·OAuth·Blob 없이 저장소의 실제 CSS와 컴포넌트를 사용합니다.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// 직접 선언한 Vitest의 공개 서버 API를 사용해 하위 의존성의 호이스팅에 의존하지 않습니다.
import { createViteServer } from "vitest/node";
import react from "@vitejs/plugin-react";
import { chromium, expect } from "@playwright/test";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let server, browser;
const failures = [], errors = [], blocked = [];
const timeout = 5_000;
expect.configure({ timeout });

/** 닫기 버튼의 같은 조상을 사용해 수정 전 일반 portal과 수정 후 dialog를 모두 조사합니다. */
const closeButton = (page) => page.getByRole("button", { name: "✕ 편집으로 돌아가기", exact: true });
const popup = (page) => closeButton(page).locator("xpath=../..");
const trigger = (page) => page.getByTitle("미리보기 (홈페이지 렌더링)");
async function open(page) {
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  await expect(closeButton(page)).toBeVisible();
}

const cases = [
  ["NAMED_DIALOG_INITIAL_FOCUS", async (page) => {
    await open(page);
    const dialog = page.getByRole("dialog", { name: "미리보기 — 실제 홈페이지와 동일한 렌더링", exact: true });
    await expect(dialog).toBeVisible();
    await expect(closeButton(page)).toBeFocused();
    const bounds = await dialog.boundingBox(), size = page.viewportSize();
    expect(bounds?.x).toBe(0); expect(bounds?.y).toBe(0);
    expect(bounds?.width).toBe(size.width); expect(bounds?.height).toBe(size.height);
  }],
  ["TAB_AND_SHIFT_TAB_TRAP", async (page) => {
    await open(page); await closeButton(page).focus();
    for (const key of ["Shift+Tab", "Tab", "Tab", "Tab", "Tab", "Tab", "Shift+Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      // Base UI의 포커스 가드가 다음 프레임에 실제 버튼·링크로 이동할 때까지 확인합니다.
      await expect.poll(() => popup(page).evaluate((element) => element.contains(document.activeElement)), { timeout, message: `${key} 이동 후 미리보기 내부 포커스` }).toBe(true);
    }
  }],
  ["ESCAPE_RESTORES_TRIGGER", async (page) => {
    await open(page); await page.keyboard.press("Escape");
    await expect(closeButton(page)).toBeHidden(); await expect(trigger(page)).toBeFocused();
    await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
    await expect(page.locator(".ProseMirror")).toBeFocused();
  }],
  ["CLOSE_RESTORES_TRIGGER", async (page) => {
    await open(page);
    await popup(page).getByRole("link", { name: "마지막 본문 링크" }).focus();
    await closeButton(page).click(); await expect(trigger(page)).toBeFocused();
  }],
  ["BACKGROUND_INERT", async (page) => {
    await open(page);
    // 라이브러리의 모달 격리는 배경을 접근성 트리와 포인터 상호작용에서 제외합니다.
    await expect(page.getByRole("button", { name: "배경 버튼", exact: true })).toHaveCount(0);
    let intercepted = false;
    try { await page.locator("#background-before").click({ trial: true, timeout: 300 }); }
    catch { intercepted = true; }
    expect(intercepted).toBe(true);
    await expect(closeButton(page)).toBeFocused();
  }],
  ["BACKGROUND_SCROLL_LOCK", async (page) => {
    await open(page);
    const before = await page.evaluate(() => window.scrollY);
    const close = await closeButton(page).boundingBox();
    await page.mouse.move(close.x + close.width / 2, close.y + close.height / 2);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout }).toBe(before);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).overflowY === "hidden" || getComputedStyle(document.body).overflowY === "hidden"), { timeout }).toBe(true);
  }],
  ["LONG_BODY_IMAGE_TABLE_KEYBOARD_SCROLL", async (page) => {
    await open(page);
    await expect(popup(page).getByRole("heading", { name: "이미지와 표가 있는 긴 본문", exact: true })).toBeVisible();
    await expect(popup(page).getByRole("table")).toHaveCount(1);
    const image = popup(page).getByRole("img", { name: "합성 검증 이미지" });
    await expect(image).toBeVisible();
    expect(await image.evaluate((element) => element.naturalWidth > 0)).toBe(true);
    const body = page.getByRole("region", { name: "미리보기 본문", exact: true });
    await body.focus(); await page.keyboard.press("PageDown");
    await expect.poll(() => body.evaluate((element) => element.scrollTop), { timeout }).toBeGreaterThan(0);
    await body.press("Control+End");
    await popup(page).getByRole("link", { name: "마지막 본문 링크" }).focus();
    await page.keyboard.press("Tab"); await expect(closeButton(page)).toBeFocused();
  }],
  ["SOURCE_REOPEN_AND_BACKGROUND_RELEASE", async (page) => {
    await page.getByTitle("마크다운 소스 보기로 전환").click();
    const source = page.locator("textarea");
    await source.fill(`${await source.inputValue()}\n\n소스에서 추가한 문단`);
    await open(page); await expect(popup(page).getByText("소스에서 추가한 문단", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape"); await expect(trigger(page)).toBeFocused();
    await open(page); await closeButton(page).click(); await expect(trigger(page)).toBeFocused();
    await page.locator("#background-before").focus(); await page.keyboard.press("Enter");
    await expect(page.locator("#background-count")).toHaveText("배경 실행 1회");
  }],
];

try {
  server = await createViteServer({ root: join(root, "tests/fixtures/editor-preview"), configFile: false,
    envFile: false, envPrefix: "HRA_EDITOR_PREVIEW_PUBLIC_", plugins: [react()],
    resolve: { alias: { "@": join(root, "src") }, dedupe: ["react", "react-dom"] },
    optimizeDeps: { include: ["react", "react-dom/client", "@base-ui/react/dialog", "@base-ui/react/button"] },
    // 클라이언트 fixture에는 운영 환경 변수를 정의하지 않으며 파일 접근도 현재 저장소로 한정합니다.
    server: { host: "127.0.0.1", port: 0, hmr: false, fs: { strict: true, allow: [root] } },
    cacheDir: join(root, "node_modules/.vite-editor-preview"), logLevel: "error" });
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    blocked.push("EXTERNAL_NETWORK"); return route.abort();
  });
  for (const [name, run] of cases) {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.name));
    try {
      await page.goto(origin); await expect(page.locator(".ProseMirror")).toBeVisible();
      await run(page); console.log(`PASS EDITOR_PREVIEW_${name}`);
    } catch (error) {
      failures.push(name); console.error(`FAIL EDITOR_PREVIEW_${name}`);
      // 모든 본문은 합성 fixture이며 실패한 기대값의 앞부분만 제한적으로 표시합니다.
      if (error instanceof Error) console.error(error.message.replace(/\x1b\[[0-9;]*m/g, "").slice(0, 500));
    }
    finally { await page.close(); }
  }
  if (failures.length || errors.length || blocked.length) throw new Error("EDITOR_PREVIEW_GATE_FAILED");
  console.log(`PASS EDITOR_PREVIEW_REQUIRED:${cases.length}`);
} catch (error) {
  console.error(error instanceof Error && /^EDITOR_PREVIEW_[A-Z_]+$/.test(error.message) ? error.message : "EDITOR_PREVIEW_SETUP_FAILED");
  if (errors.length) console.error(`EDITOR_PREVIEW_PAGE_ERRORS:${errors.length}`);
  if (blocked.length) console.error(`EDITOR_PREVIEW_NETWORK_BLOCKED:${blocked.length}`);
  process.exitCode = 1;
} finally { await browser?.close(); await server?.close(); }
