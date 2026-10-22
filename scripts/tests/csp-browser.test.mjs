/** CSP 브라우저의 닫힌 집계·네트워크 경계·실제 Chromium 음성 대조를 검증한다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { chromium } from "@playwright/test";
import { classifyCspBrowserRequest, summarizeCspViolations, installCspBrowserObserver, runCspCanaries, createCspSdkMock } from "../../tests/support/csp-browser.mjs";

const origin = "http://127.0.0.1:34567";
test("앱과 정확한 Blob SDK 경로만 허용한다", () => {
  for (const value of [origin + "/", origin + "/api/token"]) assert.equal(classifyCspBrowserRequest(value, origin), "app");
  for (const value of ["https://vercel.com/api/blob/?pathname=single.bin", "https://vercel.com/api/blob/mpu?pathname=multi.bin"]) assert.equal(classifyCspBrowserRequest(value, origin), "sdk");
  for (const value of ["https://vercel.com/api/blob", "https://vercel.com/api/blob/other", "https://vercel.com.evil.invalid/api/blob/", "https://user:password@vercel.com/api/blob/", "http://vercel.com/api/blob/", "ws://127.0.0.1:34567", "data:text/plain,hello", "not-url"]) assert.equal(classifyCspBrowserRequest(value, origin), "deny");
});

test("CSP 집계는 원본 URL 등 추가 필드와 잘못된 분류를 거부한다", () => {
  const item = { directive: "script-src-elem", disposition: "enforce", resourceKind: "inline" };
  assert.deepEqual(summarizeCspViolations([item, item]), [{ ...item, count: 2 }]);
  for (const value of [[{ ...item, blockedURI: "sensitive" }], [{ ...item, directive: "https://private.invalid" }], [{ ...item, disposition: "unknown" }], [{ ...item, resourceKind: "private" }], null]) assert.throws(() => summarizeCspViolations(value), /CSP_BROWSER_EVENTS_INVALID/);
});

/** SDK HTTP 동작의 실제 payload 모양을 합성 route로 검증한다. */
function fakeRoute(url, method, headers = {}, body = null) {
  return { request: () => ({ url: () => url, method: () => method, headers: () => headers, postDataJSON: () => body, postDataBuffer: () => Buffer.isBuffer(body) ? body : null }), fulfill: async response => response };
}
test("SDK mock은 순서·본문 크기·잘못된 경로를 거부하고 실제 두 part를 확인한다", async () => {
  const mock = createCspSdkMock(origin);
  await assert.rejects(mock.handle(fakeRoute("https://vercel.com/api/blob/mpu?pathname=multipart.bin", "POST", { "x-mpu-action": "complete" })), /CSP_BROWSER_SDK_SEQUENCE/);
  await assert.rejects(mock.handle(fakeRoute("https://vercel.com/api/blob/?pathname=single.bin", "PUT", {}, Buffer.alloc(1))), /CSP_BROWSER_SDK_SINGLE/);
  for (const [pathname, multipart] of [["single.bin", false], ["multipart.bin", true]]) await mock.handle(fakeRoute(origin + "/__csp_qa_token", "POST", {}, { type: "blob.generate-client-token", payload: { pathname, multipart } }));
  await mock.handle(fakeRoute("https://vercel.com/api/blob/?pathname=single.bin", "PUT", {}, Buffer.alloc(1024)));
  const url = "https://vercel.com/api/blob/mpu?pathname=multipart.bin";
  await mock.handle(fakeRoute(url, "POST", { "x-mpu-action": "create" }));
  const headers = { "x-mpu-key": "synthetic-key", "x-mpu-upload-id": "synthetic-upload" };
  for (const [part, size] of [[1, 8], [2, 2]]) await mock.handle(fakeRoute(url, "POST", { ...headers, "x-mpu-action": "upload", "x-mpu-part-number": String(part) }, Buffer.alloc(size * 1024 * 1024)));
  await mock.handle(fakeRoute(url, "POST", { ...headers, "x-mpu-action": "complete" }, [{ partNumber: 1, etag: "synthetic-part-1" }, { partNumber: 2, etag: "synthetic-part-2" }]));
  assert.equal(mock.verified(), true);
});

test("실제 Chromium에서 CSP canary 차단과 nonce 양성 대조를 확인한다", { timeout: 30000 }, async () => {
  const nonce = Buffer.alloc(32, 4).toString("base64");
  const policy = `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; style-src 'nonce-${nonce}'; frame-src 'self'`;
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html", "content-security-policy": policy });
    response.end(`<html><head><script nonce="${nonce}">window.__cspReady=true</script></head><body></body></html>`);
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block" });
    await installCspBrowserObserver(context);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    assert.deepEqual(await runCspCanaries(page), { script: true, style: true });
    await context.close();
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("실제 설치 Blob SDK가 Chromium CSP 아래 단일·10MiB 두 part 업로드를 수행한다", { timeout: 30000 }, async () => {
  const { build } = await import("esbuild");
  const { runCspSdkProbe } = await import("../../tests/support/csp-browser.mjs");
  const bundle = await build({ stdin: { contents: 'export {upload} from "@vercel/blob/client";', resolveDir: process.cwd() }, bundle: true, platform: "browser", format: "iife", globalName: "HraCspSdk", write: false, logLevel: "silent" });
  const nonce = Buffer.alloc(32, 5).toString("base64");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html", "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}' 'strict-dynamic'; connect-src 'self' https://vercel.com/api/blob/` });
    response.end(`<html><head><script nonce="${nonce}">window.__ready=true</script></head><body></body></html>`);
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const base = `http://127.0.0.1:${server.address().port}`, mock = createCspSdkMock(base);
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block" });
    await installCspBrowserObserver(context);
    const errors = [];
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      try {
        if (url.pathname === "/__csp_qa_sdk.js" && url.origin === base) return await route.fulfill({ status: 200, contentType: "application/javascript", body: bundle.outputFiles[0].text });
        if (classifyCspBrowserRequest(url.href, base) === "sdk" || (url.origin === base && url.pathname === "/__csp_qa_token")) return await mock.handle(route);
        if (url.origin === base) return await route.continue();
        errors.push("EXTERNAL_DENIED");
        return await route.abort();
      } catch { errors.push("MOCK_FAILED"); return route.abort(); }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    await page.goto(base);
    assert.equal(await runCspSdkProbe(page), true);
    assert.equal(mock.verified(), true);
    assert.deepEqual(errors, []);
    assert.deepEqual(await page.evaluate(() => window.__cspEvents), []);
    await context.close();
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});

test("Sonner의 빈 style 삽입만 추가 hash로 허용하며 이후 임의 CSS는 계속 차단한다", { timeout: 30000 }, async () => {
  const ts = (await import("typescript")).default;
  const { readFile } = await import("node:fs/promises");
  const source = ts.createSourceFile("sonner.js", await readFile(new URL("../../node_modules/sonner/dist/index.js", import.meta.url), "utf8"), ts.ScriptTarget.Latest, true);
  const strings = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "__insertCSS") {
      assert.equal(node.arguments.length, 1);
      assert.equal(ts.isStringLiteral(node.arguments[0]), true);
      strings.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.equal(strings.length, 1);
  const nonce = Buffer.alloc(32, 9).toString("base64");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html", "content-security-policy": `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'sha256-CIxDM5jnsGiKqXs2v7NKCY5MzdR9gu6TtiMJrDw29AY=' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='; frame-src 'self'` });
    response.end(`<html><head><script nonce="${nonce}">const style=document.createElement('style');style.type='text/css';document.head.appendChild(style);style.appendChild(document.createTextNode(${JSON.stringify(strings[0])}));</script></head><body></body></html>`);
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ serviceWorkers: "block" });
    await installCspBrowserObserver(context);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.evaluate(() => document.querySelector("style").sheet.cssRules.length > 0), true);
    assert.deepEqual(await page.evaluate(() => window.__cspEvents), []);
    await page.evaluate(() => { document.querySelector("style").textContent = ":root{--csp-unapproved:yes}"; });
    await page.waitForFunction(() => window.__cspEvents.length === 1, undefined, { timeout: 5000 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--csp-unapproved").trim()), "");
    assert.deepEqual(await page.evaluate(() => window.__cspEvents), [{ directive: "style-src-elem", disposition: "enforce", resourceKind: "inline" }]);
    // 허용된 빈 요소에 나중에 텍스트를 붙여도 허용 hash를 벗어나면 다시 차단해야 한다.
    await page.evaluate(() => {
      const style = document.createElement("style");
      document.head.appendChild(style);
      style.appendChild(document.createTextNode(":root{--csp-new-unapproved:yes}"));
    });
    await page.waitForFunction(() => window.__cspEvents.length === 2, undefined, { timeout: 5000 });
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--csp-new-unapproved").trim()), "");
    // parser가 새 문서에서 읽는 CSS도 같은 상속 정책 아래 거부되어야 한다.
    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.id = "css-parser-canary";
      frame.srcdoc = "<html><head><style>:root{--csp-parser-unapproved:yes}</style></head><body></body></html>";
      document.body.appendChild(frame);
    });
    await page.waitForFunction(() => document.querySelector("#css-parser-canary").contentWindow.__cspEvents?.length === 1, undefined, { timeout: 5000 });
    assert.equal(await page.evaluate(() => {
      const child = document.querySelector("#css-parser-canary").contentWindow;
      return child.getComputedStyle(child.document.documentElement).getPropertyValue("--csp-parser-unapproved").trim();
    }), "");
    await context.close();
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
