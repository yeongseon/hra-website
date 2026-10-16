/**
 * 환경 파일 없는 격리 worktree에서 실제 production 빌드의 전체 읽기 경로를 감사한다.
 * 빌드의 공개 글꼴 읽기는 허용하고 next start·HTTP의 외부 요청은 차단한다.
 * 두 단계 모두 합성 계정·격리 PG를 사용하며 제품 5xx는 실패 종료한다.
 * Blob 실물 업로드, 정상 CRUD, 브라우저 상호작용의 검증을 대신하지 않는다.
 */
import { spawn, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createQaPostgres } from "../tests/support/resource-qa-postgres.mjs";
import { academicG1Actors, concreteSiteRoute, installSiteRouteFixture, siteRoutePassword } from "../tests/support/site-route-fixture.mjs";

const harnessRepository = dirname(dirname(fileURLToPath(import.meta.url)));
let repository = harnessRepository;
let only = null;
const argumentsList = process.argv.slice(2);
const controller = new AbortController();
const diagnostics = new Set();
let failureSequence = 0;
const isFailureDiagnostic = code => code !== "STARTUP_RETRY";
const results = [];
const children = new Map();
const actors = ["anonymous", "pending", "studentA", "faculty", "admin", "manager"];
let cleanupFailed = false;
let cluster, output, phase = "INPUT", completed = false, cleanupComplete = false, sourceSha = null;
const limitations = ["실제 Blob 업로드·파일 스트림 미검증", "정상 CRUD·서버 액션 쓰기 미검증", "브라우저 상호작용 미검증", "알려진 동적 경로 외 합성 식별자는 fixture 제약"];

/** 외부 오류 메시지를 출력 계약으로 사용하지 않고 직접 만든 고정 코드만 던진다. */
const check = (value, code) => { if (!value) throw new Error(code); };
const signal = (milliseconds = 45_000) => AbortSignal.any([controller.signal, AbortSignal.timeout(milliseconds)]);
const basic = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
  .filter(key => process.env[key]).map(key => [key, process.env[key]]));

/** 부모의 종료와 별도로 직접 시작한 프로세스 그룹의 소멸을 확인한다. */
function groupExists(pid) {
  try { process.kill(-pid, 0); return true; }
  catch (error) { if (error.code === "ESRCH") return false; return true; }
}

/** 현재 실행에서 만든 그룹만 TERM→KILL하고 각각 유한 시간 동안 확인한다. */
async function stopChild(child) {
  const state = children.get(child);
  if (!state) return;
  if (!child.pid) { children.delete(child); return; }
  for (const [termination, milliseconds] of [["SIGTERM", 5_000], ["SIGKILL", 2_000]]) {
    if (!groupExists(child.pid)) break;
    try { process.kill(-child.pid, termination); }
    catch (error) { if (error.code !== "ESRCH") diagnostics.add("CHILD_SIGNAL_FAILED"); }
    const until = Date.now() + milliseconds;
    while (groupExists(child.pid) && Date.now() < until) await delay(50);
  }
  if (groupExists(child.pid) || !state.exited) {
    diagnostics.add("CHILD_GROUP_EXIT_UNCONFIRMED");
    cleanupFailed = true;
  }
  children.delete(child);
}

/** 프레임워크 stdout/stderr 원문은 저장하지 않고 고정 분류만 관찰한다. */
function launch(args, environment) {
  const child = spawn(process.execPath, args, { cwd: repository, env: environment,
    detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const state = { exited: false, code: null, done: null };
  state.done = new Promise(resolveDone => {
    child.once("error", () => { state.exited = true; diagnostics.add("CHILD_START_FAILED"); resolveDone(); });
    child.once("exit", code => { state.exited = true; state.code = code; resolveDone(); });
  });
  child.stdout.resume();
  child.stderr.on("data", chunk => {
    const text = String(chunk);
    for (const match of text.matchAll(/(?:QA_TRANSPORT_FAILURE|SITE_ROUTE_NETWORK):([A-Z0-9_]+)/g)) { diagnostics.add(match[1]); failureSequence++; }
    if (text.includes("Functions cannot be passed")) diagnostics.add("SERVER_ACTION_SERIALIZATION");
    if (text.includes("Attempted to call") && text.includes("buttonVariants")) diagnostics.add("CLIENT_FUNCTION_ON_SERVER");
    if (/Could not parse content as FormData|Content-Type was not one of|Request\.formData/.test(text)) diagnostics.add("FORM_DATA_PARSE_FAILURE");
    if (/\[auth\]\[error\]/.test(text)) diagnostics.add("AUTH_FAILURE");
  });
  children.set(child, state);
  return child;
}

/** 실제 빌드 manifest에서 진입점을 만들고 프레임워크 내부 경계를 구분한다. */
function compiledRoutes() {
  const manifest = JSON.parse(readFileSync(join(repository, ".next/server/app-paths-manifest.json"), "utf8"));
  return Object.keys(manifest).map(source => {
    const parts = source.split("/").filter(Boolean);
    const ending = parts.pop();
    check(["page", "route"].includes(ending), "SITE_ROUTE_MANIFEST_ENTRY");
    const path = "/" + parts.filter(part => !(part.startsWith("(") && part.endsWith(")")) && !part.startsWith("@")).join("/");
    return { source, path, kind: ending === "page" ? "page" : "api", dynamic: path.includes("[") };
  }).sort((left, right) => left.path.localeCompare(right.path));
}

/** 쿠키는 메모리 안에서만 결합하고 어떤 결과에도 넣지 않는다. */
function collectCookies(response, cookies) {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0], index = pair.indexOf("=");
    if (index > 0) cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
}
const cookieHeader = cookies => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");

/** 인증은 앱의 실제 CSRF·credentials·DB 세션 조회를 모두 통과해야 한다. */
async function login(origin, actor) {
  const cookies = new Map();
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`, { signal: signal() });
  collectCookies(csrfResponse, cookies);
  const csrf = await csrfResponse.json();
  check(typeof csrf.csrfToken === "string", "SITE_ROUTE_CSRF_FAILED");
  const response = await fetch(`${origin}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", signal: signal(), headers: {
      Origin: origin, Cookie: cookieHeader(cookies), "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1",
    }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: academicG1Actors[actor].email,
      password: siteRoutePassword, callbackUrl: origin }),
  });
  collectCookies(response, cookies);
  await response.body?.cancel();
  const cookie = cookieHeader(cookies);
  const session = await (await fetch(`${origin}/api/auth/session`, { headers: { Cookie: cookie }, signal: signal() })).json();
  check(session.user?.id === academicG1Actors[actor].id && session.user?.role === academicG1Actors[actor].role, "SITE_ROUTE_LOGIN_FAILED");
  return cookie;
}

/** 상태 코드만으로 허용을 추정하지 않고 거부 UI·설정·fixture 경계를 따로 표시한다. */
function classify(record) {
  if (record.infrastructureFailure) return "INFRASTRUCTURE_ERROR";
  if (record.error || record.status >= 500 || record.markers.errorBoundary || record.markers.digest || record.markers.softError) return "PRODUCT_ERROR";
  if (record.status === 405) return "METHOD_BLOCKED";
  if (record.path.startsWith("/api/academic/uploads") && record.status === 404) return "UNCONFIGURED";
  if (record.markers.studentRoleDenied || [401, 403].includes(record.status) || ["/login", "/pending"].includes(record.location)) return "ACCESS_DENIED";
  if (record.status === 404 && record.scenario === "normal") return "FIXTURE_LIMIT";
  if (record.status >= 400) return "ACCESS_DENIED";
  return "NORMAL";
}

/** 본문은 고정 marker 추출 후 버리고 HTML·URL·SQL·예외를 기록하지 않는다. */
async function probe(origin, sessions, route, path, actor, scenario = "normal", method = "GET") {
  controller.signal.throwIfAborted();
  const record = { route: route.path, path, actor, scenario, method };
  const failuresBefore = failureSequence;
  try {
    const response = await fetch(`${origin}${path}`, { method, redirect: "manual", signal: signal(),
      headers: { ...(sessions[actor] ? { Cookie: sessions[actor] } : {}),
        ...(method === "POST" ? { Origin: origin, "Content-Type": "application/json" } : {}) },
      ...(method === "POST" ? { body: "{}" } : {}),
    });
    const body = await response.text();
    Object.assign(record, { status: response.status,
      location: response.headers.get("location") ? new URL(response.headers.get("location"), origin).pathname : null,
      markers: {
        errorBoundary: /요청 처리 중 오류가 발생|An error occurred in the Server Components render/.test(body),
        digest: /\\?"digest\\?":\\?"[0-9]+/.test(body),
        softError: body.includes("데이터를 불러오지 못했습니다"),
        studentRoleDenied: body.includes("학생 과제에 접근할 수 없습니다."),
        syntheticAssignmentPresent: body.includes("G1 제출 수용 과제") || body.includes("종료된 제출 시험"),
      },
    });
  } catch {
    record.error = "REQUEST_FAILED_OR_TIMEOUT";
    record.markers = {};
  }
  // stderr 파이프의 고정 전송 진단을 반영해 실패를 흡수한 HTTP 200도 정상으로 세지 않는다.
  await delay(0);
  record.infrastructureFailure = failureSequence > failuresBefore;
  record.classification = classify(record);
  results.push(record);
  if (record.classification === "PRODUCT_ERROR") console.log(`제품 오류 후보: ${actor} ${route.path} ${record.status ?? record.error}`);
  if (results.length % 100 === 0) console.log(`읽기 검사 진행: ${results.length}건`);
}

/** 프레임워크 내부 경로를 제외하고 기존 역할·ID·중복 검색 행렬을 유지한다. */
async function audit(origin, sessions, routes) {
  for (const route of routes) {
    if (["/_global-error", "/_not-found"].includes(route.path)) {
      results.push({ route: route.path, scenario: "framework-internal", classification: "NOT_PUBLIC_ENTRY" });
      continue;
    }
    const path = concreteSiteRoute(route.path);
    const actor = route.path.startsWith("/admin/academics") ? "manager"
      : route.path.startsWith("/admin") && route.path !== "/admin/login" ? "admin"
      : route.path === "/pending" ? "pending"
      : route.path.startsWith("/resources") || route.path.startsWith("/member") || route.path === "/mypage" ? "studentA" : "anonymous";
    await probe(origin, sessions, route, path, actor);
    if (route.dynamic && route.kind === "page" && !route.path.includes("[slug]")) await probe(origin, sessions, route,
      path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "not-a-uuid"), actor, "invalid-id");
    if (route.dynamic && route.kind === "page") await probe(origin, sessions, route,
      route.path.includes("[slug]") ? path.replace(/route-audit-(?:guide|template)/, "missing-route-audit")
        : path.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "99999999-9999-4999-8999-999999999999"), actor, "missing-id");
    if (route.kind === "api" && route.path !== "/api/auth/[...nextauth]" && !["/favicon.ico", "/opengraph-image"].includes(route.path)) {
      for (const role of actors) {
        if (role !== actor) await probe(origin, sessions, route, path, role, "role-boundary");
        if (route.path.includes("uploads") || route.path.includes("upload-image")) await probe(origin, sessions, route, path, role, "empty-post", "POST");
      }
    }
    if (route.kind === "page" && (route.path.startsWith("/admin") && route.path !== "/admin/login"
      || route.path.startsWith("/member") || route.path.startsWith("/resources") || route.path === "/mypage")) {
      for (const role of actors) if (role !== actor) await probe(origin, sessions, route, path, role, "role-boundary");
    }
  }
  for (const path of ["/notices", "/press", "/alumni", "/resources", "/resources/weekly-texts", "/resources/class-logs"]) {
    if (only && only !== path) continue;
    for (const query of ["?page=abc", "?page=-1", "?page=99999999999999999999", "?page=1&page=2", "?q=first&q=second", "?q=%20"]) {
      await probe(origin, sessions, { path }, path + query, path.startsWith("/resources") ? "studentA" : "anonymous", "query-boundary");
    }
  }
}

/** 출력 경로는 명시했을 때만 사용하며 원본 응답과 인증 자료는 포함하지 않는다. */
function report() {
  const classifications = results.reduce((counts, record) => {
    counts[record.classification] = (counts[record.classification] ?? 0) + 1; return counts;
  }, {});
  const value = { sourceSha, scope: { appRoot: repository, only }, completed, cleanupComplete,
    coverageHealthy: completed && cleanupComplete && ![...diagnostics].some(isFailureDiagnostic) && !results.some(record => ["PRODUCT_ERROR", "INFRASTRUCTURE_ERROR"].includes(record.classification)),
    phase, limitations,
    summary: { routes: new Set(results.map(record => record.route)).size, records: results.length, classifications },
    diagnostics: [...diagnostics].sort(), results };
  if (output) writeFileSync(output, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  return value;
}

/** 종료 신호에서도 finally를 거치며 다른 worktree·DB·서버는 건드리지 않는다. */
const onInterrupt = () => { diagnostics.add("INTERRUPTED"); controller.abort(); };
process.once("SIGINT", onInterrupt);
process.once("SIGTERM", onInterrupt);
const deadline = setTimeout(() => { diagnostics.add("RUN_TIMEOUT"); controller.abort(); }, 15 * 60_000);
deadline.unref();

try {
  if (argumentsList.length === 1 && argumentsList[0] === "--help") {
    console.log("사용법: HRA_TEST_PG_BIN=<PostgreSQL bin> node scripts/verify-site-routes.mjs [--app-root 절대worktree경로] [--only manifest경로] [--output 결과.json]");
    console.log("환경 파일 없는 worktree에서 production 빌드·격리 DB·읽기 HTTP를 검사합니다. Blob 실물·정상 CRUD·브라우저 상호작용은 포함하지 않습니다.");
  } else {
    const options = new Map();
    for (let index = 0; index < argumentsList.length; index += 2) {
      const key = argumentsList[index], value = argumentsList[index + 1];
      check(["--app-root", "--only", "--output"].includes(key) && typeof value === "string" && value.length > 0 && !options.has(key), "SITE_ROUTE_ARGUMENTS");
      options.set(key, value);
    }
    if (options.has("--app-root")) {
      check(isAbsolute(options.get("--app-root")), "SITE_ROUTE_APP_ROOT_ABSOLUTE_REQUIRED");
      repository = resolve(options.get("--app-root"));
    }
    if (options.has("--only")) {
      only = options.get("--only");
      check(only.startsWith("/") && !/[?#\\]/.test(only), "SITE_ROUTE_ONLY_INVALID");
    }
    if (options.has("--output")) {
      check(options.get("--output").endsWith(".json"), "SITE_ROUTE_OUTPUT_INVALID");
      output = resolve(options.get("--output"));
    }
    check(existsSync(join(repository, "package.json")) && existsSync(join(repository, "src/lib/db/schema.ts")), "SITE_ROUTE_APP_ROOT_INVALID");
    check(spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repository, env: basic, encoding: "utf8" }).stdout?.trim() === "true", "SITE_ROUTE_WORKTREE_REQUIRED");
    check(!readdirSync(repository).some(name => name === ".env" || /^\.env\.(?:local|development|production|test)(?:\.local)?$/.test(name)), "SITE_ROUTE_ENV_FILE");
    check(process.env.HRA_TEST_PG_BIN, "SITE_ROUTE_PG_BIN_REQUIRED");
    sourceSha = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repository, env: basic, encoding: "utf8" }).stdout?.trim() || null;
    phase = "SCHEMA";
    const exported = spawnSync(process.execPath, [join(repository, "node_modules/drizzle-kit/bin.cjs"), "export", "--dialect", "postgresql", "--schema", "./src/lib/db/schema.ts"],
      { cwd: repository, env: basic, encoding: "utf8", timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
    check(exported.status === 0 && exported.stdout.includes('CREATE TABLE "users"'), "SITE_ROUTE_SCHEMA_EXPORT_FAILED");
    cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
    installSiteRouteFixture(cluster, repository, exported.stdout);
    controller.signal.throwIfAborted();
    const listener = createServer();
    await new Promise((resolveReady, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolveReady); });
    const port = listener.address().port;
    await new Promise(resolveClosed => listener.close(resolveClosed));
    const origin = `http://localhost:${port}`;
    const environment = { ...basic, ...cluster.environment, LC_ALL: "C", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1",
      HRA_SITE_ROUTE_ORIGIN: origin, AUTH_SECRET: randomBytes(48).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_URL: origin, NEXTAUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin,
      AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "", BLOB_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_READ_WRITE_TOKEN: "",
      ACADEMIC_ENABLED: "true", ACADEMIC_ENROLLMENT_WRITES_ENABLED: "true", ACADEMIC_UPLOADS_ENABLED: "false", ACADEMIC_APPROVER_USER_ID: academicG1Actors.manager.id,
      // 합성 비밀키는 앱에만 전달한다. cron 요청에는 넣지 않아 정리 쓰기를 실행하지 않는다.
      CRON_SECRET: randomBytes(32).toString("hex"),
      NODE_OPTIONS: `--import=${pathToFileURL(join(harnessRepository, "tests/support/site-route-preload.mjs")).href}`,
    };
    phase = "BUILD";
    console.log("격리 스키마·합성 fixture 설치 완료. 실제 production 빌드를 확인합니다.");
    controller.signal.throwIfAborted();
    // OG의 data: WASM과 공개 한글 대체 글꼴은 빌드에서만 기존 동작대로 읽는다.
    // DB는 동일한 단일 격리 어댑터로 제한하며 Blob·OAuth 자격증명은 계속 빈 값이다.
    const buildEnvironment = { ...environment,
      NODE_OPTIONS: `--import=${pathToFileURL(join(harnessRepository, "tests/support/resource-qa-preload.mjs")).href}`,
    };
    const build = launch([join(repository, "node_modules/next/dist/bin/next"), "build", "--webpack"], buildEnvironment);
    await Promise.race([children.get(build).done, new Promise(resolveAbort => { if (controller.signal.aborted) resolveAbort(); else controller.signal.addEventListener("abort", resolveAbort, { once: true }); })]);
    controller.signal.throwIfAborted();
    check(children.get(build).code === 0, "SITE_ROUTE_BUILD_FAILED");
    await stopChild(build);
    check(!cleanupFailed, "SITE_ROUTE_BUILD_CLEANUP_FAILED");
    check(existsSync(join(repository, ".next/BUILD_ID")), "SITE_ROUTE_BUILD_OUTPUT_MISSING");
    const inventory = compiledRoutes();
    check(inventory.length > 0, "SITE_ROUTE_EMPTY_MANIFEST");
    check(!only || inventory.some(route => route.path === only), "SITE_ROUTE_ONLY_NOT_IN_MANIFEST");
    const routes = only ? inventory.filter(route => route.path === only) : inventory;
    phase = "SERVER";
    const server = launch([join(repository, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], environment);
    const readyDeadline = Date.now() + 90_000;
    let ready = false;
    while (!ready && Date.now() < readyDeadline && !children.get(server).exited) {
      controller.signal.throwIfAborted();
      try { const response = await fetch(`${origin}/api/auth/csrf`, { signal: signal(3_000) }); ready = response.ok; await response.body?.cancel(); }
      catch { diagnostics.add("STARTUP_RETRY"); }
      if (!ready) await delay(250);
    }
    check(ready, "SITE_ROUTE_SERVER_NOT_READY");
    phase = "AUTH";
    const sessions = { anonymous: "" };
    for (const actor of actors.filter(actor => actor !== "anonymous")) sessions[actor] = await login(origin, actor);
    console.log(`정상 credentials 5역할 확인. compiled 경로 ${routes.length}개를 검사합니다.`);
    phase = "HTTP";
    await audit(origin, sessions, routes);
    completed = true;
    phase = "COMPLETE";
    if (results.some(record => record.classification === "PRODUCT_ERROR")) process.exitCode = 1;
  }
} catch (error) {
  diagnostics.add(error instanceof Error && /^SITE_ROUTE_[A-Z_]+$/.test(error.message) ? error.message : "SITE_ROUTE_EXECUTION_FAILED");
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  for (const child of children.keys()) await stopChild(child);
  try { cluster?.close(); cleanupComplete = !cleanupFailed; if (cleanupFailed) process.exitCode = 1; }
  catch { diagnostics.add("SITE_ROUTE_DATABASE_CLEANUP_FAILED"); process.exitCode = 1; }
  process.removeListener("SIGINT", onInterrupt);
  process.removeListener("SIGTERM", onInterrupt);
  if ([...diagnostics].some(isFailureDiagnostic)) process.exitCode = 1;
  try {
    const final = report();
    if (!(argumentsList.length === 1 && argumentsList[0] === "--help")) console.log(JSON.stringify({ completed, cleanupComplete, ...final.summary, diagnostics: final.diagnostics, exitCode: process.exitCode ?? 0 }));
  } catch { console.error("SITE_ROUTE_REPORT_FAILED"); process.exitCode = 1; }
}
