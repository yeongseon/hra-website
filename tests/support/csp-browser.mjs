/**
 * 실제 production HTML에서 nonce·클라이언트 탐색·인쇄·Blob SDK를 검증한다.
 * 합성 세션은 메모리에만 보관하고 URL·HTML·쿠키·nonce 원문을 결과에 저장하지 않는다.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { ids } from "./site-route-fixture.mjs";
import { validatePublicBrowserOrigin } from "./expanded-public-browser.mjs";

const check = (value, code) => { if (!value) throw new Error(code); };
const sdkOrigin = "https://vercel.com";
const bundlePath = "/__csp_qa_sdk.js";
const tokenPath = "/__csp_qa_token";
const caseIds = ["html-scopes", "nonce-isolation", "editor-navigation", "print-log", "print-weekly", "print-template", "negative-canaries", "blob-sdk"];

/** 정확한 앱 원점과 공급자 API 두 경로만 분류하며 다른 연결은 거부한다. */
export function classifyCspBrowserRequest(value, origin) {
  try {
    const url = new URL(value);
    if (url.username || url.password) return "deny";
    if (url.origin === origin) return "app";
    if (url.origin === sdkOrigin && ["/api/blob/", "/api/blob/mpu"].includes(url.pathname)) return "sdk";
  } catch { return "deny"; }
  return "deny";
}

/** 원문 이벤트 대신 닫힌 필드 집합의 집계만 읽는다. */
export function summarizeCspViolations(events) {
  check(Array.isArray(events) && events.length <= 1000, "CSP_BROWSER_EVENTS_INVALID");
  const counts = new Map();
  for (const event of events) {
    check(event && Object.keys(event).sort().join(",") === "directive,disposition,resourceKind" &&
      typeof event.directive === "string" && /^[a-z-]{1,40}$/.test(event.directive) &&
      ["enforce", "report"].includes(event.disposition) && ["inline", "eval", "same-origin", "external", "other"].includes(event.resourceKind), "CSP_BROWSER_EVENTS_INVALID");
    const key = `${event.directive}:${event.disposition}:${event.resourceKind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].map(([key, count]) => { const [directive, disposition, resourceKind] = key.split(":"); return { directive, disposition, resourceKind, count }; });
}

/** 임의 script·style은 차단하고 올바른 nonce만 허용하는지 확인한다. */
export async function runCspCanaries(page) {
  await page.evaluate(() => {
    const nonce = document.querySelector("script[nonce]")?.nonce;
    if (!nonce) throw new Error("CSP_CANARY_NONCE_MISSING");
    // strict-dynamic의 신뢰 전파와 혼동하지 않도록 parser가 읽는 srcdoc에서 검사한다.
    // srcdoc는 현재 문서의 CSP를 상속하며 외부 연결을 만들지 않는다.
    const frame = document.createElement("iframe");
    frame.id = "csp-canary-frame";
    frame.srcdoc = `<html><head><script nonce="${nonce}">window.__canaryEvents=[];document.addEventListener('securitypolicyviolation',function(e){window.__canaryEvents.push({directive:e.effectiveDirective,disposition:e.disposition,resourceKind:'inline'})})<\/script><script>window.__cspBlockedScript=true<\/script><script nonce="${nonce}">window.__cspAllowedScript=true<\/script><style>#csp-canary{--csp-blocked:yes}</style><style nonce="${nonce}">#csp-canary{--csp-allowed:yes}</style></head><body><div id="csp-canary"></div></body></html>`;
    document.body.append(frame);
  });
  await page.waitForFunction(() => {
    const child = document.querySelector("#csp-canary-frame")?.contentWindow;
    return child?.__cspAllowedScript === true && child.__canaryEvents.some(event => event.directive === "script-src-elem") && child.__canaryEvents.some(event => event.directive === "style-src-elem");
  }, undefined, { timeout: 10000 });
  const result = await page.evaluate(() => {
    const child = document.querySelector("#csp-canary-frame").contentWindow;
    const style = child.getComputedStyle(child.document.querySelector("#csp-canary"));
    return { script: child.__cspBlockedScript !== true && child.__cspAllowedScript === true,
      style: style.getPropertyValue("--csp-blocked").trim() === "" && style.getPropertyValue("--csp-allowed").trim() === "yes", events: child.__canaryEvents };
  });
  check(result.script && result.style && summarizeCspViolations(result.events).filter(event => event.disposition === "enforce" && event.resourceKind === "inline").length === 2, "CSP_BROWSER_CANARY_FAILED");
  return { script: true, style: true };
}

/** 문서 시작 시 관찰자를 등록하고 CSP 이벤트의 원본 URL은 즉시 버린다. */
export async function installCspBrowserObserver(context) {
  await context.addInitScript(() => {
    window.__cspEvents = [];
    window.__cspPrintCalls = 0;
    window.print = () => { window.__cspPrintCalls++; };
    document.addEventListener("securitypolicyviolation", event => {
      const uri = event.blockedURI;
      let resourceKind = "other";
      if (uri === "inline" || uri === "eval") resourceKind = uri;
      else { try { resourceKind = new URL(uri).origin === location.origin ? "same-origin" : "external"; } catch { /* URL 해석 실패 시에도 원문은 보관하지 않는다. */ } }
      const sanitized = { directive: event.effectiveDirective, disposition: event.disposition, resourceKind };
      window.__cspEvents.push(sanitized);
      if (window.__hraCspViolation) void window.__hraCspViolation(sanitized);
    });
  });
}

/** 실행이 멈춰도 소유 브라우저를 유한 시간 안에 종료한다. */
async function bounded(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("CSP_BROWSER_TIMEOUT")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

/** 세션 헤더를 브라우저의 같은 출처 쿠키로만 변환한다. */
function browserCookies(cookie, origin) {
  check(typeof cookie === "string" && cookie.length <= 65536, "CSP_BROWSER_SESSION_INVALID");
  return cookie.split(";").filter(value => value.trim()).map(value => {
    const separator = value.indexOf("=");
    check(separator > 0, "CSP_BROWSER_SESSION_INVALID");
    return { name: value.slice(0, separator).trim(), value: value.slice(separator + 1).trim(), url: origin, httpOnly: true, sameSite: "Lax" };
  });
}

/** 설치된 실제 브라우저 SDK를 디스크에 쓰지 않고 번들한다. */
async function sdkBundle(repository) {
  const result = await build({ stdin: { contents: 'export { upload } from "@vercel/blob/client";', resolveDir: repository, sourcefile: "csp-sdk-entry.js" }, bundle: true, platform: "browser", format: "iife", globalName: "HraCspSdk", write: false, logLevel: "silent", sourcemap: false });
  check(result.outputFiles.length === 1, "CSP_BROWSER_SDK_BUNDLE");
  return result.outputFiles[0].text;
}

/** 고정 경로·메서드·multipart 순서에만 응답하는 공급자 모형이다. */
export function createCspSdkMock(origin) {
  const state = { tokens: 0, single: 0, create: 0, parts: 0, bytes: 0, complete: 0 };
  const uploadedParts = new Set();
  const metadata = pathname => ({ url: `https://synthetic.public.blob.vercel-storage.com/${pathname}`, downloadUrl: `https://synthetic.public.blob.vercel-storage.com/${pathname}?download=1`, pathname, contentType: "application/octet-stream", contentDisposition: "attachment", etag: "synthetic-etag" });
  return { state,
    async handle(route) {
      const request = route.request(), url = new URL(request.url()), method = request.method();
      const headers = { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, PUT, OPTIONS", "access-control-allow-headers": request.headers()["access-control-request-headers"] ?? "*", "content-type": "application/json" };
      const json = body => route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
      if (url.origin === origin && url.pathname === tokenPath) {
        check(method === "POST", "CSP_BROWSER_SDK_TOKEN");
        const body = request.postDataJSON();
        check(body.type === "blob.generate-client-token" && ["single.bin", "multipart.bin"].includes(body.payload.pathname) && body.payload.multipart === (body.payload.pathname === "multipart.bin"), "CSP_BROWSER_SDK_TOKEN");
        state.tokens++;
        return json({ type: "blob.generate-client-token", clientToken: "vercel_blob_client_synthetic_csp-only-not-valid" });
      }
      check(classifyCspBrowserRequest(request.url(), origin) === "sdk", "CSP_BROWSER_SDK_PATH");
      if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
      const pathname = url.searchParams.get("pathname"), action = request.headers()["x-mpu-action"];
      if (url.pathname === "/api/blob/" && method === "PUT") {
        check(pathname === "single.bin" && request.postDataBuffer()?.length === 1024, "CSP_BROWSER_SDK_SINGLE");
        state.single++;
        return json(metadata(pathname));
      }
      check(url.pathname === "/api/blob/mpu" && method === "POST" && pathname === "multipart.bin", "CSP_BROWSER_SDK_MULTIPART");
      if (action === "create") { check(state.create === 0, "CSP_BROWSER_SDK_SEQUENCE"); state.create++; return json({ key: "synthetic-key", uploadId: "synthetic-upload" }); }
      check(state.create === 1 && request.headers()["x-mpu-upload-id"] === "synthetic-upload" && request.headers()["x-mpu-key"] === "synthetic-key", "CSP_BROWSER_SDK_SEQUENCE");
      if (action === "upload") {
        const part = Number(request.headers()["x-mpu-part-number"]), bytes = request.postDataBuffer()?.length;
        check(Number.isInteger(part) && part > 0 && part <= 2 && bytes > 0 && bytes <= 8 * 1024 * 1024 && !uploadedParts.has(part), "CSP_BROWSER_SDK_PART");
        uploadedParts.add(part); state.parts++; state.bytes += bytes;
        return json({ etag: `synthetic-part-${part}` });
      }
      check(action === "complete" && state.parts === 2 && state.bytes === 10 * 1024 * 1024, "CSP_BROWSER_SDK_COMPLETE");
      const parts = request.postDataJSON();
      check(Array.isArray(parts) && parts.length === 2 && parts.every(part => uploadedParts.has(part.partNumber) && part.etag === `synthetic-part-${part.partNumber}`), "CSP_BROWSER_SDK_COMPLETE");
      state.complete++;
      return json(metadata(pathname));
    },
    verified() { return state.tokens === 2 && state.single === 1 && state.create === 1 && state.parts === 2 && state.bytes === 10 * 1024 * 1024 && state.complete === 1; },
  };
}

/** 각 route 처리를 추적하고 종료 중에도 차단 규칙을 유지한다. */
async function guardedContext(browser, origin, cookie, bundle, sdk, record, signal) {
  const context = await browser.newContext({ serviceWorkers: "block", acceptDownloads: false });
  const pending = new Set(), events = [];
  await context.exposeBinding("__hraCspViolation", (_source, event) => { summarizeCspViolations([event]); events.push(event); });
  let closing = false;
  await context.addCookies(browserCookies(cookie, origin));
  await installCspBrowserObserver(context);
  await context.routeWebSocket(/.*/, socket => { record.denied++; socket.close(); });
  const handle = async route => {
    const request = route.request(), url = new URL(request.url());
    if (closing || signal?.aborted) return route.abort();
    const category = classifyCspBrowserRequest(request.url(), origin);
    if (category === "deny") { record.denied++; return route.abort("blockedbyclient"); }
    if (category === "sdk" || url.pathname === tokenPath) return sdk.handle(route);
    if (url.pathname === bundlePath) return route.fulfill({ status: 200, contentType: "application/javascript", body: bundle });
    // redirect 자동 추적을 끄고 다음 외부 요청도 차단 규칙을 통과시킨다.
    const response = await route.fetch({ maxRedirects: 0, timeout: 30000 });
    return route.fulfill({ response });
  };
  await context.route("**/*", route => {
    const task = handle(route).catch(async () => { record.routeErrors++; await route.abort().catch(() => { record.closeErrors++; }); }).finally(() => pending.delete(task));
    pending.add(task);
    return task;
  });
  return { context, events, async close() {
    closing = true;
    await context.route("**/*", route => route.abort());
    await bounded(Promise.all([...pending]), 10000);
    await bounded(context.close(), 10000);
  } };
}

/** 실제 앱 문서와 브라우저에서 관찰한 nonce의 일치를 검증한다. */
async function documentNonce(page, response) {
  const csp = response?.headers()["content-security-policy"];
  const nonce = /'nonce-([^']+)'/.exec(csp ?? "")?.[1];
  check(nonce && !/unsafe-eval/.test(csp) && !csp.split(";").find(value => value.trim().startsWith("script-src "))?.includes("unsafe-inline"), "CSP_BROWSER_POLICY");
  const result = await page.evaluate(expected => {
    const scripts = [...document.querySelectorAll("script")].filter(script => script.textContent || script.src);
    return { scripts: scripts.length, match: scripts.every(script => script.nonce === expected) };
  }, nonce);
  check(result.scripts > 0 && result.match, "CSP_BROWSER_DOCUMENT_NONCE");
  return nonce;
}

/** RSC 갱신 뒤 새 앱 style도 초기 문서 nonce를 사용하는지 확인한다. */
async function assertAppStyles(page, nonce) {
  const result = await page.evaluate(expected => {
    const styles = [...document.querySelectorAll("style")].filter(style => style.textContent.includes("@page") || style.textContent.includes(".ProseMirror"));
    return { count: styles.length, matches: styles.every(style => style.nonce === expected), tiptapMissing: styles.some(style => style.hasAttribute("data-tiptap-style") && !style.nonce) };
  }, nonce);
  check(result.count > 0, "CSP_BROWSER_STYLE_MISSING");
  check(!result.tiptapMissing, "CSP_BROWSER_TIPTAP_NONCE_MISSING");
  check(result.matches, "CSP_BROWSER_STYLE_MISMATCH");
}

/** refresh 응답 본문과 두 프레임을 기다려 이전 DOM만 읽고 통과하는 검증을 피한다. */
async function refreshDocument(page) {
  const expectedPath = new URL(page.url()).pathname;
  const [response] = await Promise.all([
    page.waitForResponse(value => value.request().headers().rsc === "1" && new URL(value.url()).pathname === expectedPath),
    page.evaluate(() => window.next.router.refresh()),
  ]);
  await response.finished();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

/** 실제 브라우저 SDK를 같은 출처 script로 로드하고 단일·10MiB 업로드를 실행한다. */
export async function runCspSdkProbe(page) {
  await bounded(page.evaluate(route => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.nonce = document.querySelector("script[nonce]").nonce;
    script.src = route;
    script.onload = () => resolve(); script.onerror = () => reject(new Error("CSP_SDK_LOAD"));
    document.body.append(script);
  }), bundlePath), 15000);
  return bounded(page.evaluate(async handleUploadUrl => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      for (const [pathname, size, multipart] of [["single.bin", 1024, false], ["multipart.bin", 10 * 1024 * 1024, true]]) {
        const result = await window.HraCspSdk.upload(pathname, new File([new Uint8Array(size)], pathname, { type: "application/octet-stream" }), { access: "public", handleUploadUrl, multipart, abortSignal: controller.signal });
        if (result.pathname !== pathname) return false;
      }
      return true;
    } finally { clearTimeout(timer); }
  }, tokenPath), 20000);
}

/** 원문 로그·세션을 출력하지 않고 production 모드 CSP 사례를 실행한다. */
export async function runCspBrowser({ repository, origin, sessions, fixtureRoot, signal }) {
  origin = validatePublicBrowserOrigin(origin);
  check(path.isAbsolute(repository) && path.isAbsolute(fixtureRoot) && sessions && ["studentA", "admin", "manager"].every(actor => typeof sessions[actor] === "string" && sessions[actor]), "CSP_BROWSER_INPUT");
  const routerSource = await readFile(path.join(repository, "node_modules/next/dist/client/components/app-router-instance.js"), "utf8");
  check(routerSource.includes("window.next.router = publicAppRouterInstance"), "CSP_BROWSER_ROUTER_SOURCE");
  const bundle = await sdkBundle(repository);
  const sdk = createCspSdkMock(origin), record = { denied: 0, routeErrors: 0, closeErrors: 0, pageErrors: 0 };
  let server, browser, stage = "START", cleanupComplete = false, normalViolations = 0, negativeCanaries;
  const contexts = new Set(), cases = [];
  const safeEnvironment = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
  const abort = () => { void server?.kill().catch(() => { record.closeErrors++; }); };
  signal?.addEventListener("abort", abort, { once: true });
  const makePage = async actor => {
    check(!signal?.aborted, "CSP_BROWSER_ABORTED");
    const guarded = await guardedContext(browser, origin, sessions[actor] ?? "", bundle, sdk, record, signal);
    contexts.add(guarded);
    const page = await guarded.context.newPage();
    page.setDefaultTimeout(20000);
    page.on("pageerror", () => { record.pageErrors++; });
    return { page, guarded };
  };
  const finish = async (page, guarded, negative = false) => {
    await page.evaluate(() => Promise.resolve());
    const events = guarded.events;
    if (!negative) {
      const enforced = summarizeCspViolations(events).filter(event => event.disposition === "enforce");
      normalViolations += enforced.reduce((count, event) => count + event.count, 0);
      if (enforced.length) {
        const first = enforced[0];
        throw new Error(`CSP_BROWSER_ENFORCED_${first.directive.replaceAll("-", "_").toUpperCase()}_${first.resourceKind.replaceAll("-", "_").toUpperCase()}`);
      }
    }
    await guarded.close(); contexts.delete(guarded);
  };
  const pass = id => { check(caseIds.includes(id), "CSP_BROWSER_CASE"); cases.push({ id, status: "passed" }); };
  try {
    server = await chromium.launchServer({ headless: true, timeout: 30000, env: safeEnvironment });
    if (signal?.aborted) { await server.kill(); throw new Error("CSP_BROWSER_ABORTED"); }
    browser = await chromium.connect(server.wsEndpoint(), { timeout: 30000 });
    stage = "HTML";
    for (const [actor, route, status] of [["anonymous", "/login", 200], ["anonymous", "/system-error", 200], ["anonymous", "/missing.csp-test", 404], ["anonymous", "/curriculum", 200], ["studentA", "/mypage", 200], ["admin", "/admin/docs", 200], ["manager", "/admin/academics", 200]]) {
      stage = `HTML_${actor.toUpperCase()}`;
      const { page, guarded } = await makePage(actor);
      const response = await page.goto(origin + route, { waitUntil: "networkidle" });
      check(response.status() === status, "CSP_BROWSER_HTML_STATUS");
      await documentNonce(page, response);
      await finish(page, guarded);
    }
    pass("html-scopes");
    stage = "NONCE";
    const noncePages = await Promise.all([makePage("anonymous"), makePage("anonymous")]);
    await noncePages[0].page.setExtraHTTPHeaders({ "x-nonce": "synthetic-forged-nonce", "content-security-policy": "script-src * 'unsafe-inline'" });
    const values = await Promise.all(noncePages.map(async ({ page }) => documentNonce(page, await page.goto(origin + "/login", { waitUntil: "networkidle" }))));
    check(new Set(values).size === 2 && !values.includes("synthetic-forged-nonce"), "CSP_BROWSER_NONCE_ISOLATION");
    const fresh = await documentNonce(noncePages[0].page, await noncePages[0].page.reload({ waitUntil: "networkidle" }));
    check(!values.includes(fresh), "CSP_BROWSER_NONCE_RELOAD");
    for (const entry of noncePages) await finish(entry.page, entry.guarded);
    pass("nonce-isolation");
    stage = "EDITOR";
    {
      const { page, guarded } = await makePage("admin");
      const nonce = await documentNonce(page, await page.goto(origin + "/admin/notices", { waitUntil: "networkidle" }));
      const editPath = `/admin/notices/${ids.notice}/edit`;
      await page.evaluate(route => window.next.router.prefetch(route), editPath);
      await page.locator(`a[href="${editPath}"]`).click();
      await page.waitForURL(origin + editPath);
      await page.locator(".tiptap").waitFor();
      await assertAppStyles(page, nonce);
      await page.locator(".tiptap").fill("합성 CSP 편집 확인");
      await page.getByTitle("미리보기 (홈페이지 렌더링)", { exact: true }).click();
      await page.getByRole("region", { name: "미리보기 본문" }).getByText("합성 CSP 편집 확인", { exact: true }).waitFor();
      await page.getByRole("button", { name: "✕ 편집으로 돌아가기", exact: true }).click();
      await page.goBack(); await page.waitForURL(origin + "/admin/notices");
      await page.goForward(); await page.waitForURL(origin + editPath);
      await refreshDocument(page);
      await page.locator(".tiptap").waitFor();
      await assertAppStyles(page, nonce);
      await finish(page, guarded);
    }
    pass("editor-navigation");
    for (const [id, detail, category] of [["print-log", `/resources/${ids.log}`, "주차별 수업일지"], ["print-weekly", `/resources/weekly-texts/${ids.weekly}`, "주차별 텍스트"], ["print-template", "/member/templates/route-audit-template", "보고서 양식"]]) {
      stage = id.toUpperCase().replaceAll("-", "_");
      const { page, guarded } = await makePage("studentA");
      const nonce = await documentNonce(page, await page.goto(origin + "/resources", { waitUntil: "networkidle" }));
      stage = id.toUpperCase().replaceAll("-", "_") + "_CATEGORY";
      await page.getByRole("button", { name: category, exact: true }).click();
      await page.evaluate(route => window.next.router.prefetch(route), detail);
      stage = id.toUpperCase().replaceAll("-", "_") + "_DETAIL_LINK";
      await page.locator(`a[href="${detail}"]`).first().click();
      await page.waitForURL(origin + detail);
      stage = id.toUpperCase().replaceAll("-", "_") + "_PRINT_LINK";
      await page.locator(`a[href="${detail}/print"]`).click();
      await page.waitForURL(origin + detail + "/print");
      stage = id.toUpperCase().replaceAll("-", "_") + "_AUTOMATIC";
      await page.waitForFunction(() => window.__cspPrintCalls >= 1);
      await assertAppStyles(page, nonce);
      stage = id.toUpperCase().replaceAll("-", "_") + "_BUTTON";
      const before = await page.evaluate(() => window.__cspPrintCalls);
      await page.getByRole("button", { name: "다시 인쇄", exact: true }).click();
      check(await page.evaluate(() => window.__cspPrintCalls) === before + 1, "CSP_BROWSER_PRINT_BUTTON");
      stage = id.toUpperCase().replaceAll("-", "_") + "_HISTORY";
      await page.goBack(); await page.waitForURL(origin + detail);
      await page.goForward(); await page.waitForURL(origin + detail + "/print");
      stage = id.toUpperCase().replaceAll("-", "_") + "_REFRESH";
      await refreshDocument(page);
      await assertAppStyles(page, nonce);
      await finish(page, guarded);
      pass(id);
    }
    stage = "CANARY";
    {
      const { page, guarded } = await makePage("anonymous");
      await page.goto(origin + "/login", { waitUntil: "networkidle" });
      negativeCanaries = await runCspCanaries(page);
      await finish(page, guarded, true);
    }
    pass("negative-canaries");
    stage = "SDK";
    {
      const { page, guarded } = await makePage("anonymous");
      await page.goto(origin + "/login", { waitUntil: "networkidle" });
      const success = await runCspSdkProbe(page);
      check(success && sdk.verified(), "CSP_BROWSER_SDK_UNVERIFIED");
      await finish(page, guarded);
    }
    pass("blob-sdk");
    check(normalViolations === 0, "CSP_BROWSER_ENFORCED_VIOLATION");
    check(record.pageErrors === 0, "CSP_BROWSER_PAGE_ERROR");
    check(record.denied === 0, "CSP_BROWSER_EXTERNAL_DENIED");
    check(record.routeErrors === 0 && record.closeErrors === 0, "CSP_BROWSER_ROUTE_FAILED");
    check(cases.length === caseIds.length, "CSP_BROWSER_CASE_MISSING");
  } catch (error) {
    // 직접 정의한 고정 코드만 유지하고 Playwright의 URL·DOM·헤더 원문은 버린다.
    throw new Error(/^CSP_BROWSER_[A-Z_]+$/.test(error?.message ?? "") ? `CSP_BROWSER_${stage}_${error.message.slice("CSP_BROWSER_".length)}` : `CSP_BROWSER_${stage}_FAILED`);
  } finally {
    signal?.removeEventListener("abort", abort);
    let failed = false;
    for (const guarded of contexts) { try { await guarded.close(); } catch { failed = true; } }
    if (server) {
      try { await bounded(server.close(), 10000); }
      catch { try { await bounded(server.kill(), 5000); } catch { failed = true; } }
      if (server.process().exitCode === null && server.process().signalCode === null) failed = true;
    }
    cleanupComplete = !failed;
    if (failed) throw new Error("CSP_BROWSER_CLEANUP_FAILED");
  }
  return { completed: true, cases, normalViolations, negativeCanaries, sdk: { single: true, multipart: true }, cleanupComplete };
}
