/**
 * #293: 기존 production 빌드의 공개 Markdown 전달 JS와 클라이언트 호출자를 실제 Chrome으로 검증합니다.
 * 격리 PG·기존 Neon 전송기만 사용하며 브라우저 외부 요청은 차단하고 이미지는 합성 응답합니다.
 * 사용: HRA_TEST_PG_BIN=... node scripts/verify-markdown-boundary.mjs --output=... [--baseline=...]
 * --baseline이 없으면 변경 전 client reference를, 있으면 변경 후 서버 경계와 동일 HTML을 검사합니다.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { hashSync } from "bcryptjs";
import { chromium } from "@playwright/test";
import { createQaPostgres, qaPassword } from "../tests/support/resource-qa-postgres.mjs";
import { exportQaSchemaSql } from "../tests/support/qa-schema-export.mjs";
import { sqlLiteral } from "../tests/support/neon-psql-transport.mjs";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const args = Object.fromEntries(process.argv.slice(2).map(value => {
  const match = /^--(output|baseline)=(.+)$/.exec(value);
  assert(match, "지원하는 인자는 --output=경로와 --baseline=경로입니다.");
  return [match[1], match[2]];
}));
assert(args.output, "결과 JSON의 --output=경로가 필요합니다.");
const baseline = args.baseline ? JSON.parse(readFileSync(args.baseline, "utf8")) : null;
const id = "20000000-0000-4000-8000-000000000001";
const adminId = "10000000-0000-4000-8000-000000000001";
const memberId = "10000000-0000-4000-8000-000000000002";
const routes = [
  { path: `/notices/${id}`, manifest: "(public)/notices/[id]" },
  { path: `/alumni/${id}`, manifest: "(public)/alumni/[id]" },
  { path: "/recruitment", manifest: "(public)/recruitment" },
];
// 세 경로·미리보기·인쇄 모두 같은 긴 본문과 허용/차단 사례를 사용합니다.
const markdown = [
  "# 합성 Markdown 경계 검증", "**강조**와 `코드`, [내부 링크](/faq), [외부 링크](https://example.invalid/guide).",
  "| 항목 | 설명 |\n| --- | --- |\n| 표 첫 행 | 한글 & 기호 |\n| 표 둘째 행 | **굵게** |",
  '![합성 이미지](/images/markdown-qa.png "합성 제목")',
  '<img src="/images/markdown-qa.png" alt="너비 이미지" title="크기 제목" style="width: 50%">',
  '<img src="https://outside.invalid/blocked.png" onerror="실행"><script>실행</script>',
  ...Array.from({ length: 100 }, (_, index) => `긴 본문 ${index + 1}: 한글 문장과 **서식**, [안내 링크](/faq), 기호 & < 문자와 백틱 \`코드\`를 보존합니다.`),
  "마지막 본문 검증 표식",
].join("\n\n");
const hash = value => createHash("sha256").update(value).digest("hex");
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64");
let cluster, server, serverDone, browser;
const serverFailures = new Set();

/** 실제 사용자 정보 없이 필요한 테이블과 계정·본문만 같은 값으로 설치합니다. */
function seed() {
  cluster.sql(exportQaSchemaSql(repository));
  cluster.sql(readFileSync(join(repository, "scripts/sql/rate-limit-reservations.sql"), "utf8"));
  const body = sqlLiteral(markdown), password = sqlLiteral(hashSync(qaPassword, 12));
  cluster.sql(`INSERT INTO users(id,name,email,password_hash,role) VALUES
    ('${adminId}','합성 관리자','admin@markdown-qa.invalid',${password},'ADMIN'),
    ('${memberId}','합성 회원','member@markdown-qa.invalid',${password},'MEMBER');
    INSERT INTO notices(id,title,content,status,author_id,created_at) VALUES('${id}','합성 공지',${body},'PUBLISHED','${adminId}','2026-10-21');
    INSERT INTO alumni_stories(id,name,quote,content,created_at) VALUES('${id}','합성 수료생','합성 인용',${body},'2026-10-21');
    INSERT INTO recruitment_settings(details_markdown,poster_layout) VALUES(${body},'none');
    INSERT INTO class_logs(id,title,content,class_date,author_id) VALUES('${id}','합성 일지',${body},'2026-10-21','${adminId}');
    INSERT INTO weekly_texts(id,title,body,created_at) VALUES('${id}','합성 텍스트',${body},'2026-10-21');
    INSERT INTO report_templates(slug,title,category,body) VALUES('markdown-qa','합성 양식','template',${body});`);
}

/** 기존 서버 전송기와 소켓 경계를 재사용하며 외부 자격정보는 상속하지 않습니다. */
async function start() {
  const listener = createServer();
  await new Promise(resolve => listener.listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const inherited = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
    .filter(key => process.env[key]).map(key => [key, process.env[key]]));
  server = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repository, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...inherited, ...cluster.environment, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      AUTH_SECRET: "synthetic-markdown-boundary-secret-293", AUTH_TRUST_HOST: "true", AUTH_URL: origin,
      NEXTAUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin, HRA_SITE_ROUTE_ORIGIN: origin,
      NODE_OPTIONS: `--import=${JSON.stringify(join(repository, "tests/support/site-route-preload.mjs"))}` },
  });
  server.stdout.resume();
  server.stderr.on("data", chunk => {
    for (const match of String(chunk).matchAll(/(?:QA_TRANSPORT_FAILURE|SITE_ROUTE_NETWORK):([A-Z0-9_]+)/g)) serverFailures.add(match[1]);
  });
  serverDone = new Promise(resolve => { server.once("exit", resolve); server.once("error", resolve); });
  for (let attempt = 0; attempt < 120; attempt++) {
    assert(server.exitCode === null, "격리 production 서버가 종료되었습니다.");
    try {
      const response = await fetch(`${origin}/api/auth/csrf`, { signal: AbortSignal.timeout(2000) });
      if (response.ok) { await response.body?.cancel(); return origin; }
      await response.body?.cancel();
    } catch {
      // 시작 중 로컬 연결 실패는 제한된 횟수 안에서만 재시도합니다.
      await delay(250);
      continue;
    }
    await delay(250);
  }
  throw new Error("격리 production 서버 준비 실패");
}

/** 새 컨텍스트·고정 viewport를 사용하고 사전 가져오기·외부 요청·실제 이미지 전송을 배제합니다. */
async function context(origin, javaScriptEnabled = true) {
  const value = await browser.newContext({ viewport: { width: 1280, height: 720 }, javaScriptEnabled, serviceWorkers: "block" });
  const blocked = { external: 0, prefetch: 0 };
  await value.route("**/*", async route => {
    const request = route.request(), url = new URL(request.url()), headers = request.headers();
    if (headers["next-router-prefetch"] || /prefetch/i.test(headers.purpose ?? headers["sec-purpose"] ?? "")) {
      blocked.prefetch++; await route.abort(); return;
    }
    if (url.origin !== origin) { blocked.external++; await route.abort(); return; }
    if (url.pathname === "/images/markdown-qa.png") {
      await route.fulfill({ contentType: "image/png", body: png }); return;
    }
    await route.continue();
  });
  return { value, blocked };
}

/** 본문 계약을 DOM으로 확인하고 HTML의 완전 일치도 비교할 수 있도록 해시로 저장합니다. */
async function article(page) {
  const body = page.locator("article.prose").last();
  await body.getByText("마지막 본문 검증 표식", { exact: true }).waitFor();
  assert.equal(await body.locator("table tbody tr").count(), 2, "표 행이 유지되어야 합니다.");
  assert.equal(await body.locator("img").count(), 2, "허용 이미지 두 개만 남아야 합니다.");
  assert.equal(await body.locator("img[onerror],script").count(), 0, "위험 속성과 태그는 제거되어야 합니다.");
  assert.equal(await body.locator('a[href="/faq"]').count(), 101, "긴 본문과 링크가 유지되어야 합니다.");
  assert.equal(await body.locator('img[title="크기 제목"]').evaluate(image => image.style.width), "50%");
  const html = await body.evaluate(element => element.outerHTML);
  return { htmlSha256: hash(html), htmlBytes: Buffer.byteLength(html) };
}

/** 실제 완료된 _next/static/*.js 요청만 CDP의 encodedDataLength(HTTP 헤더 포함)로 합산합니다. */
async function measure(origin, path) {
  const { value, blocked } = await context(origin);
  try {
    const page = await value.newPage(), session = await value.newCDPSession(page);
    const requests = new Map(), failures = [];
    page.on("pageerror", () => failures.push("PAGE_ERROR"));
    page.on("console", message => { if (/hydration|did not match|server rendered HTML|Minified React error #4\d\d/i.test(message.text())) failures.push("HYDRATION"); });
    await session.send("Network.enable");
    await session.send("Network.setCacheDisabled", { cacheDisabled: true });
    await session.send("Network.setBypassServiceWorker", { bypass: true });
    session.on("Network.requestWillBeSent", event => {
      const url = new URL(event.request.url);
      if (url.origin === origin && /^\/_next\/static\/.+\.js$/.test(url.pathname)) requests.set(event.requestId, { path: url.pathname });
    });
    session.on("Network.responseReceived", event => {
      const request = requests.get(event.requestId);
      if (request) Object.assign(request, {
        status: event.response.status,
        encoding: Object.entries(event.response.headers).find(([name]) => name.toLowerCase() === "content-encoding")?.[1] ?? "identity",
        cached: !!event.response.fromDiskCache,
      });
    });
    session.on("Network.loadingFinished", event => {
      const request = requests.get(event.requestId);
      if (request) request.encodedBytes = event.encodedDataLength;
    });
    const response = await page.goto(`${origin}${path}`, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200, "공개 페이지 응답은 200이어야 합니다.");
    const rendered = await article(page);
    await page.waitForTimeout(500);
    assert.deepEqual(failures, [], "브라우저 실행·hydration 오류가 없어야 합니다.");
    assert.equal(blocked.external, 0, "공개 페이지는 외부 이미지 요청도 만들지 않아야 합니다.");
    const chunks = [...requests.values()].sort((a, b) => a.path.localeCompare(b.path));
    assert(chunks.length && chunks.every(item => item.status === 200 && !item.cached && item.encodedBytes > 0), "실제 전송이 완료된 cold JS만 집계해야 합니다.");
    return { ...rendered, jsChunks: chunks.length, jsEncodedBytes: chunks.reduce((sum, item) => sum + item.encodedBytes, 0), chunks, blocked, hydrationErrors: failures.length };
  } finally { await value.close(); }
}

/** 새 JS 비활성 컨텍스트로 서버 HTML의 본문을 따로 확인합니다. */
async function serverHtml(origin, path) {
  const { value } = await context(origin, false);
  try {
    const page = await value.newPage();
    assert.equal((await page.goto(`${origin}${path}`, { waitUntil: "networkidle" })).status(), 200);
    return await article(page);
  } finally { await value.close(); }
}

/** 정상 CSRF·credentials로 역할별 세션을 만들며 쿠키·비밀번호를 산출물에 기록하지 않습니다. */
async function login(value, origin, role) {
  const csrf = await (await value.request.get(`${origin}/api/auth/csrf`)).json();
  await value.request.post(`${origin}/api/auth/callback/credentials`, {
    headers: { Origin: origin, "X-Auth-Return-Redirect": "1" },
    form: { csrfToken: csrf.csrfToken, email: `${role}@markdown-qa.invalid`, password: qaPassword, callbackUrl: origin },
  });
  const session = await (await value.request.get(`${origin}/api/auth/session`)).json();
  assert.equal(session.user?.role, role.toUpperCase(), "실제 DB의 정상 인증이 필요합니다.");
}

/** 관리자 미리보기와 세 종류 회원 인쇄의 기존 클라이언트 동작을 production 브라우저에서 확인합니다. */
async function clients(origin) {
  const admin = await context(origin), member = await context(origin);
  try {
    await login(admin.value, origin, "admin");
    const page = await admin.value.newPage(), failures = [];
    page.on("pageerror", () => failures.push("PAGE_ERROR"));
    page.on("console", message => { if (/hydration|did not match|server rendered HTML|Minified React error #4\d\d/i.test(message.text())) failures.push("HYDRATION"); });
    await page.goto(`${origin}/admin/notices/${id}/edit`, { waitUntil: "networkidle" });
    await page.getByTitle("미리보기 (홈페이지 렌더링)", { exact: true }).click();
    const previewHtml = await article(page);
    // 신규 CSR DOM과 최초 SSR은 style 문자열 등이 다를 수 있으므로 호출 위치별 원본 HTML을 전후 비교합니다.
    await page.getByRole("button", { name: "✕ 편집으로 돌아가기", exact: true }).click();
    assert(await page.locator(".ProseMirror").isVisible(), "미리보기 뒤 편집으로 돌아가야 합니다.");
    await login(member.value, origin, "member");
    const printPaths = [`/resources/${id}/print`, `/resources/weekly-texts/${id}/print`, "/member/templates/markdown-qa/print"];
    const printHtml = [];
    for (const path of printPaths) {
      const print = await member.value.newPage();
      print.on("pageerror", () => failures.push("PAGE_ERROR"));
      print.on("console", message => { if (/hydration|did not match|server rendered HTML|Minified React error #4\d\d/i.test(message.text())) failures.push("HYDRATION"); });
      await print.addInitScript(() => { window.__qaPrints = 0; window.print = () => { window.__qaPrints++; }; });
      assert.equal((await print.goto(`${origin}${path}`, { waitUntil: "networkidle" })).status(), 200);
      const rendered = await article(print);
      printHtml.push({ path, ...rendered });
      await print.waitForFunction(() => window.__qaPrints === 1);
      await print.getByRole("button", { name: "다시 인쇄", exact: true }).click();
      assert.equal(await print.evaluate(() => window.__qaPrints), 2, "인쇄 재시도 버튼이 동작해야 합니다.");
      await print.close();
    }
    assert.deepEqual(failures, [], "미리보기·인쇄의 브라우저 오류가 없어야 합니다.");
    return { editorPreview: previewHtml, returnToEditor: true, printHtml, authenticatedPrintRoutes: printPaths.length, automaticAndManualPrint: true };
  } finally { await admin.value.close(); await member.value.close(); }
}

try {
  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN); seed();
  const origin = await start();
  browser = await chromium.launch({ executablePath: process.env.HRA_QA_CHROME ?? "/usr/bin/google-chrome", headless: true });
  const result = { node: process.version, chrome: browser.version(), lockSha256: hash(readFileSync(join(repository, "package-lock.json"))), fixtureSha256: hash(markdown),
    measurement: "새 Chrome 컨텍스트·1280x720·HTTP 캐시/서비스워커/Next prefetch 차단. networkidle+500ms까지 완료된 _next/static/*.js 요청의 CDP Network.loadingFinished.encodedDataLength 합계(응답 헤더 포함); HTML/CSS/이미지/RSC 제외.", routes: [], clients: null };
  if (baseline) for (const field of ["node", "chrome", "lockSha256", "fixtureSha256"]) assert.equal(result[field], baseline[field], "전후 측정 조건이 같아야 합니다.");
  for (const route of routes) {
    const sandbox = {};
    runInNewContext(readFileSync(join(repository, `.next/server/app/${route.manifest}/page_client-reference-manifest.js`), "utf8"), sandbox);
    const clientModules = [...new Set(Object.values(sandbox.__RSC_MANIFEST).flatMap(manifest => Object.keys(manifest.clientModules)))];
    const references = clientModules.filter(name => /markdown-viewer|react-markdown|remark-gfm|rehype-raw|rehype-sanitize/.test(name)).map(name => name.replace(repository, "<repo>"));
    assert.equal(references.some(name => name.includes("markdown-viewer")), !baseline, "공개 client reference 경계가 예상과 같아야 합니다.");
    const ssr = await serverHtml(origin, route.path), samples = [await measure(origin, route.path), await measure(origin, route.path)];
    for (const sample of samples) { assert.equal(sample.htmlSha256, ssr.htmlSha256); assert.equal(sample.htmlBytes, ssr.htmlBytes); }
    assert.deepEqual(samples[0].chunks.map(item => item.path), samples[1].chunks.map(item => item.path), "반복 cold load의 청크 집합이 같아야 합니다.");
    const entry = { path: route.path, serverHtml: ssr, clientReferences: references, samples };
    if (baseline) {
      const before = baseline.routes.find(item => item.path === route.path);
      assert.deepEqual(ssr, before.serverHtml, "변경 전후 Markdown HTML은 같아야 합니다.");
      assert(samples[0].jsEncodedBytes < before.samples[0].jsEncodedBytes, "실제 JS 전달량이 줄어야 합니다.");
    }
    result.routes.push(entry);
    console.log(`PASS ${route.path}: JS ${samples[0].jsChunks}개 / ${samples[0].jsEncodedBytes} encoded bytes, SSR·hydrate 본문 동일`);
  }
  result.clients = await clients(origin);
  if (baseline) assert.deepEqual(result.clients, baseline.clients, "미리보기·인쇄의 원본 HTML과 동작도 변경 전후 같아야 합니다.");
  assert.equal(serverFailures.size, 0, "격리 전송·서버 네트워크 오류가 없어야 합니다.");
  writeFileSync(args.output, `${JSON.stringify(result, null, 2)}\n`);
  console.log("PASS 실제 관리자 미리보기와 회원 인쇄 3종, 자동/수동 인쇄. 합성 결과 JSON 저장 완료");
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : "Markdown 경계 QA 실행 실패: 격리 실행 환경을 확인하세요.");
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server?.pid && server.exitCode === null) {
    process.kill(-server.pid, "SIGTERM");
    await Promise.race([serverDone, delay(5000)]);
    if (server.exitCode === null) process.kill(-server.pid, "SIGKILL");
  }
  cluster?.close();
}
