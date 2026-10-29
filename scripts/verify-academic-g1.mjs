/**
 * 비밀값 없는 PR에서도 실제 Next·정상 인증·격리 PostgreSQL·로컬 private 저장소로 G1을 검증한다.
 * 외부 환경 파일을 읽지 않고 기능 코드를 교체하지 않으며 모든 자원은 이 실행의 임시 범위에 둔다.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createQaPostgres, qaPassword } from "../tests/support/resource-qa-postgres.mjs";
import { academicG1Actors, academicG1Ids, academicG1Migrations, installAcademicG1Base,
  installAcademicG1Migrations, seedAcademicG1Domain, verifyAcademicG1Deadline, verifyAcademicG1Recovery } from "../tests/support/academic-g1-fixture.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const arguments_ = process.argv.slice(2);
const production = arguments_.length === 0 || (arguments_.length === 1 && arguments_[0] === "--production");
const safeEnvironment = () => Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
  .filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
const check = (condition, code) => { if (!condition) throw new Error(`G1_${code}`); };
const completed = new Set();
const pass = (code) => { completed.add(code); console.log(`PASS G1_${code}`); };
const abort = new AbortController();
let cluster, app, browser;
let output = "";
const blobHost = "academicg1qa.private.blob.vercel-storage.com";
const blobToken = `vercel_blob_rw_academicg1qa_${randomBytes(24).toString("hex")}`;
const secrets = new Set([blobToken]);

/** 임의 포트 번호만 예약 확인하고 실제 수신은 각 자식 프로세스에 한정한다. */
async function port() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const value = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return value;
}
function collect(child) {
  let pending = "";
  child.stdout.on("data", (chunk) => {
    output += String(chunk); pending += String(chunk);
    const lines = pending.split(/\r?\n/); pending = lines.pop() ?? "";
    for (const line of lines) if (/^(?:PASS|FAIL) G1:[A-Z_]+$/.test(line) || /^FAIL G1_(?:LOCATION|ERROR):[A-Z0-9_:]+$/.test(line)) console.log(line);
  });
  child.stderr.on("data", (chunk) => { output += String(chunk); });
  const done = new Promise((resolve) => { child.once("error", () => resolve(-1)); child.once("close", resolve); });
  return { child, done };
}
async function stop(instance) {
  if (!instance || !Number.isInteger(instance.child.pid)) return;
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try { process.kill(-instance.child.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw new Error("G1_PROCESS_CLEANUP"); }
    if (signal === "SIGTERM") await Promise.race([instance.done, delay(5_000)]);
  }
}
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  abort.abort();
  for (const instance of [browser, app]) {
    if (!instance?.child.pid) continue;
    try { process.kill(-instance.child.pid, "SIGTERM"); }
    catch (error) { if (error.code !== "ESRCH") process.exitCode = 1; }
  }
});
async function start(enabled, storeOrigin) {
  const appOrigin = `http://127.0.0.1:${await port()}`;
  const authSecret = randomBytes(48).toString("hex"); secrets.add(authSecret);
  const environment = { ...safeEnvironment(), ...cluster.environment, LC_ALL: "C", NODE_ENV: "production",
    AUTH_SECRET: authSecret, AUTH_TRUST_HOST: "true", AUTH_URL: appOrigin,
    NEXTAUTH_URL: appOrigin, NEXT_PUBLIC_APP_URL: appOrigin, NEXT_TELEMETRY_DISABLED: "1",
    AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "",
    BLOB_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_BLOB_HOST: "",
    ACADEMIC_ENABLED: String(enabled), ACADEMIC_ENROLLMENT_WRITES_ENABLED: "true", ACADEMIC_UPLOADS_ENABLED: "true",
    ACADEMIC_APPROVER_USER_ID: academicG1Actors.manager.id,
    ACADEMIC_SUBMISSION_BLOB_HOST: blobHost, ACADEMIC_SUBMISSION_READ_WRITE_TOKEN: blobToken,
    ACADEMIC_UPLOAD_CLEANUP_ENABLED: "false", ACADEMIC_UPLOAD_CLEANUP_DELETE_ENABLED: "false",
    VERCEL_BLOB_CALLBACK_URL: appOrigin, VERCEL_BLOB_RETRIES: "0",
    HRA_G1_APP_ORIGIN: appOrigin, HRA_G1_STORE_ORIGIN: storeOrigin,
    NODE_OPTIONS: `--import=${JSON.stringify(join(root, "tests/support/academic-g1-preload.mjs"))}` };
  app = collect(spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start",
    "--hostname", "127.0.0.1", "--port", new URL(appOrigin).port],
  { cwd: root, env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"] }));
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !abort.signal.aborted && app.child.exitCode === null) {
    try {
      const response = await fetch(`${appOrigin}/api/auth/csrf`, { signal: AbortSignal.timeout(5_000), redirect: "manual" });
      await response.body?.cancel();
      if (response.ok) return appOrigin;
    } catch { await delay(200); continue; }
    await delay(200);
  }
  throw new Error("G1_APP_READY");
}
async function login(origin, name) {
  const response = await fetch(`${origin}/api/auth/csrf`, { redirect: "manual" });
  const pairs = response.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  const csrf = await response.json();
  const loggedIn = await fetch(`${origin}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { Origin: origin, Cookie: pairs.join("; "), "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: academicG1Actors[name].email, password: qaPassword, callbackUrl: origin }) });
  const cookie = [...pairs, ...loggedIn.headers.getSetCookie().map((value) => value.split(";", 1)[0])].join("; ");
  await loggedIn.body?.cancel();
  const session = await (await fetch(`${origin}/api/auth/session`, { headers: { Cookie: cookie }, redirect: "manual" })).json();
  check(session.user?.id === academicG1Actors[name].id, "DISABLED_LOGIN");
  return cookie;
}

/** 학사 표 설치 전의 v1 거부가 공통 JSON·요청 참조·비공개 캐시 계약을 지키는지 실제 HTTP로 확인한다. */
async function verifyDisabledV1(origin, path, cookie, expectedStatus, expectedCode) {
  const response = await fetch(`${origin}${path}`, { headers: cookie ? { Cookie: cookie } : {}, redirect: "manual" });
  check(response.status === expectedStatus, "DISABLED_V1_STATUS");
  let body;
  try { body = await response.json(); }
  catch { throw new Error("G1_DISABLED_V1_JSON"); }
  check(body && typeof body === "object" && Object.keys(body).join(",") === "error" &&
    body.error && typeof body.error === "object" &&
    Object.keys(body.error).sort().join(",") === "code,message,requestId" &&
    body.error.code === expectedCode && typeof body.error.message === "string" && body.error.message.length > 0 &&
    typeof body.error.requestId === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.error.requestId), "DISABLED_V1_CONTRACT");
  check(response.headers.get("X-Request-Id") === body.error.requestId &&
    response.headers.get("Cache-Control") === "private, no-store" &&
    // Next의 RSC 협상 토큰이 함께 있어도 쿠키별 응답 분리가 유지되는지 검사한다.
    response.headers.get("Vary")?.split(",").some(value => value.trim().toLowerCase() === "cookie"), "DISABLED_V1_HEADERS");
}
try {
  check(arguments_.length === 0 || production, "ARGUMENTS");
  check(![".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]
    .some((name) => existsSync(join(root, name))), "ENV_FILE");
  check(academicG1Migrations.every((name) => existsSync(join(root, "scripts", name))), "FEATURE_BASE_REQUIRED");
  check(existsSync(join(root, ".next", "BUILD_ID")), "BUILD_REQUIRED");
  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
  installAcademicG1Base(cluster);
  const storeOrigin = `http://127.0.0.1:${await port()}`;
  let appOrigin = await start(false, storeOrigin);
  for (const name of ["studentA", "manager", "admin", "faculty", "pending"]) {
    const cookie = await login(appOrigin, name);
    const response = await fetch(`${appOrigin}/api/academic/submissions/${academicG1Ids.active}/file/${academicG1Ids.draft}`,
      { headers: { Cookie: cookie }, redirect: "manual" });
    check(response.status === (["studentA", "manager"].includes(name) ? 404 : 403), "DISABLED_API");
    await response.body?.cancel();
    // 학생 조회는 MEMBER만, 개인 파일은 학생 또는 정확히 지정된 책임자만 기능 gate에 도달한다.
    for (const path of ["/api/v1/assignments", `/api/v1/assignments/${academicG1Ids.active}`,
      `/api/v1/assignments/${academicG1Ids.active}/submission`]) {
      await verifyDisabledV1(appOrigin, path, cookie, name === "studentA" ? 503 : 403,
        name === "studentA" ? "DISABLED" : "FORBIDDEN");
    }
    await verifyDisabledV1(appOrigin,
      `/api/v1/submissions/${academicG1Ids.active}/files/${academicG1Ids.draft}`, cookie,
      ["studentA", "manager"].includes(name) ? 503 : 403,
      ["studentA", "manager"].includes(name) ? "DISABLED" : "FORBIDDEN");
    if (name === "manager") {
      const preparation = await fetch(`${appOrigin}/admin/academics/assignments`, { headers: { Cookie: cookie }, redirect: "manual" });
      check(preparation.status === 200 && (await preparation.text()).includes("준비"), "DISABLED_PREPARATION");
    }
  }
  for (const path of ["/api/v1/assignments",
    `/api/v1/submissions/${academicG1Ids.active}/files/${academicG1Ids.draft}`]) {
    await verifyDisabledV1(appOrigin, path, null, 401, "UNAUTHENTICATED");
  }
  check(cluster.sql("SELECT to_regclass('academic_students') IS NULL") === "t", "DISABLED_TABLES");
  pass("GATE_OFF");
  await stop(app); app = undefined;
  installAcademicG1Migrations(cluster); seedAcademicG1Domain(cluster);
  pass("MIGRATIONS_SEQUENTIAL_REPEAT");
  await verifyAcademicG1Deadline(cluster.environment); pass("DATABASE_DEADLINE");
  verifyAcademicG1Recovery(cluster); pass("RECOVERY_DRIFT");
  appOrigin = await start(true, storeOrigin);
  const config = join(cluster.root, "academic-g1-playwright.config.mjs");
  writeFileSync(config, `export default ${JSON.stringify({ testDir: join(root, "tests/e2e"), testMatch: "academic-g1.spec.mts",
    timeout: 120_000, expect: { timeout: 20_000 }, workers: 1, retries: 0, maxFailures: 0, fullyParallel: false,
    outputDir: join(cluster.root, "browser-output"), reporter: [[join(root, "tests/support/academic-g1-reporter.mjs")]],
    use: { baseURL: appOrigin, trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }] })};\n`, { mode: 0o600 });
  browser = collect(spawn(process.execPath, [join(root, "node_modules/@playwright/test/cli.js"), "test", "--config", config],
    { cwd: root, detached: true, stdio: ["ignore", "pipe", "pipe"], env: { ...safeEnvironment(), ...cluster.environment,
      CI: "true", NODE_OPTIONS: "", HRA_G1_APP_ORIGIN: appOrigin, HRA_G1_STORE_ORIGIN: storeOrigin,
      ACADEMIC_SUBMISSION_BLOB_HOST: blobHost, ACADEMIC_SUBMISSION_READ_WRITE_TOKEN: blobToken } }));
  check(await browser.done === 0 && output.includes("PASS G1_REQUIRED_CASES:10"), "BROWSER_REQUIRED");
  browser = undefined;
  for (const actor of Object.values(academicG1Actors)) check(!output.includes(actor.email), "LOG_EMAIL_LEAK");
  check([...secrets].every(value => !output.includes(value)) && !/vercel_blob_(?:rw|client)_[a-zA-Z0-9_+/=-]+/.test(output) &&
    !/(?:__Secure-)?authjs\.(?:session-token|csrf-token)=/i.test(output), "LOG_SECRET_LEAK");
  check(!/https:\/\/[^\s]+\.private\.blob\.vercel-storage\.com\/academic-uploads\//.test(output), "LOG_STORAGE_LEAK");
  check(!output.includes("QA_G1_NETWORK_BLOCKED:"), "SERVER_EXTERNAL_NETWORK");
  pass("NO_LEAK_NETWORK");
  pass("BROWSER_REQUIRED");
} catch (error) {
  console.error(error instanceof Error && /^G1_[A-Z0-9_]+$/.test(error.message) ? error.message : "G1_GATE_FAILED");
  for (const code of new Set(output.match(/QA_(?:G1_NETWORK_BLOCKED|TRANSPORT_FAILURE):[A-Z0-9_]+/g) ?? [])) console.error(code);
  for (const match of output.matchAll(/^FAIL G1:[A-Z_]+$/gm)) console.error(match[0]);
  for (const match of output.matchAll(/^FAIL G1_(?:LOCATION|ERROR):[A-Z0-9_:]+$/gm)) console.error(match[0]);
  process.exitCode = 1;
} finally {
  try { await stop(browser); await stop(app); }
  finally { cluster?.close(); }
}
if (process.exitCode !== 1) {
  check(["GATE_OFF", "MIGRATIONS_SEQUENTIAL_REPEAT", "DATABASE_DEADLINE", "RECOVERY_DRIFT", "NO_LEAK_NETWORK", "BROWSER_REQUIRED"].every((code) => completed.has(code)), "INCOMPLETE");
  console.log("PASS G1_CLEANUP");
}
