/**
 * #285 보호 경로의 응답 계약을 실제 production Next·Auth.js 래퍼·격리 PostgreSQL로 검증합니다.
 * G1의 합성 계정과 Neon→PostgreSQL 전송을 재사용하며 운영 환경 파일·비밀값은 읽지 않습니다.
 * CSRF·credentials 로그인·JWT 콜백의 현재 DB 조회·세션 검증·Proxy는 실제 코드를 실행합니다.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { createQaPostgres, qaPassword } from "../tests/support/resource-qa-postgres.mjs";
import { academicG1Actors, installAcademicG1Base } from "../tests/support/academic-g1-fixture.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const secret = randomBytes(48).toString("hex");
const check = (condition, code) => { if (!condition) throw new Error(`PROXY_${code}`); };
const failures = [];
const diagnostics = new Set();
let cluster, app, done, assertions = 0, stage = "SETUP";

/** 외부 DB·OAuth·Blob·NODE_OPTIONS를 물려받지 않는 최소 실행 환경입니다. */
function safeEnvironment() {
  return Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
    .filter((name) => process.env[name]).map((name) => [name, process.env[name]]));
}

/** 이 실행만 사용하는 포트와 프로세스 그룹을 할당합니다. */
async function start() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  app = spawn(process.execPath, [join(root, "node_modules/next/dist/bin/next"), "start",
    "--hostname", "127.0.0.1", "--port", String(port)], { cwd: root, detached: true,
    stdio: ["ignore", "pipe", "pipe"], env: { ...safeEnvironment(), ...cluster.environment,
      NODE_ENV: "production", AUTH_SECRET: secret, AUTH_TRUST_HOST: "true", AUTH_URL: origin,
      NEXTAUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin, NEXT_TELEMETRY_DISABLED: "1",
      AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "",
      ACADEMIC_ENABLED: "false", ACADEMIC_APPROVER_USER_ID: academicG1Actors.manager.id,
      NODE_OPTIONS: `--import=${JSON.stringify(join(root, "tests/support/resource-qa-preload.mjs"))}` } });
  done = new Promise((resolve) => { app.once("error", () => resolve(-1)); app.once("close", resolve); });
  app.stdout.resume();
  app.stderr.on("data", (chunk) => {
    // SQL·쿠키·회원 정보가 섞일 수 있는 원문 로그 대신 고정 진단 코드만 보관합니다.
    const text = String(chunk).replace(/\x1b\[[0-9;]*m/g, "");
    for (const match of text.matchAll(/QA_TRANSPORT_FAILURE:([0-9A-Z_]+)/g)) diagnostics.add(match[1]);
    for (const match of text.matchAll(/\[auth\]\[error\]\s*([A-Za-z]+)(?=:)/g)) diagnostics.add(match[1]);
  });
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && app.exitCode === null) {
    try {
      const response = await fetch(`${origin}/api/auth/csrf`, { signal: AbortSignal.timeout(5_000) });
      await response.body?.cancel();
      if (response.ok) return origin;
    } catch { await delay(200); continue; }
    await delay(200);
  }
  throw new Error("PROXY_APP_READY");
}

/** 정상 CSRF·credentials 로그인으로 발급받은 세션을 실제 DB 계정과 대조합니다. */
async function sessionCookie(origin, name) {
  stage = `SESSION_${name.toUpperCase()}`;
  const actor = academicG1Actors[name];
  const csrfResponse = await fetch(`${origin}/api/auth/csrf`);
  const pairs = csrfResponse.headers.getSetCookie().map((value) => value.split(";", 1)[0]);
  const csrf = await csrfResponse.json();
  const login = await fetch(`${origin}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    headers: { Origin: origin, Cookie: pairs.join("; "), "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: actor.email, password: qaPassword, callbackUrl: origin }) });
  if (!login.headers.getSetCookie().some((value) => value.includes("authjs.session-token="))) {
    const result = await login.json();
    const code = new URL(result.url, origin).searchParams.get("error");
    if (code && /^[A-Za-z]+$/.test(code)) diagnostics.add(code);
    throw new Error(`PROXY_LOGIN_COOKIE_HTTP_${login.status}`);
  }
  const cookie = [...pairs, ...login.headers.getSetCookie().map((value) => value.split(";", 1)[0])].join("; ");
  await login.body?.cancel();
  const response = await fetch(`${origin}/api/auth/session`, { headers: { Cookie: cookie } });
  const session = await response.json();
  check(response.status === 200, `SESSION_HTTP_${response.status}`);
  check(session?.user?.id === actor.id && session?.user?.role === actor.role, `SESSION_${name.toUpperCase()}`);
  assertions++;
  return cookie;
}

/** 허용은 존재하지 않는 경로의 404, 거부는 Proxy가 먼저 만든 명시 응답으로 구분합니다. */
async function verify(origin, name, cookie, pathname, expected) {
  stage = `${name.toUpperCase()}_${pathname.replaceAll(/[^a-z0-9]/gi, "_").toUpperCase()}`;
  const response = await fetch(`${origin}${pathname}?callbackUrl=https%3A%2F%2Foutside.invalid%2F`, {
    redirect: "manual", signal: AbortSignal.timeout(30_000), headers: cookie ? { Cookie: cookie } : {},
  });
  const body = await response.text();
  const label = stage;
  let valid = response.status === expected.status;
  if (expected.location) {
    const location = new URL(response.headers.get("location") ?? "/missing", origin);
    valid &&= location.origin === origin && location.pathname === expected.location;
    valid &&= location.searchParams.get("callbackUrl") === (expected.callback ? pathname : null);
  }
  if (expected.status === 403) {
    valid &&= body === expected.body && response.headers.get("cache-control") === "no-store";
    valid &&= response.headers.get("content-type") === "text/plain; charset=utf-8";
    valid &&= !response.headers.has("location");
  }
  assertions++;
  if (!valid) failures.push(`${label}_HTTP_${response.status}`);
}

/** 종료 시 이 실행의 Next 프로세스와 임시 DB만 제거합니다. */
async function cleanup() {
  if (app?.pid) {
    for (const signal of ["SIGTERM", "SIGKILL"]) {
      try { process.kill(-app.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") throw new Error("PROXY_CLEANUP"); }
      if (signal === "SIGTERM") await Promise.race([done, delay(5_000)]);
    }
    app = undefined;
  }
  cluster?.close(); cluster = undefined;
}
for (const signal of ["SIGTERM", "SIGINT"]) process.once(signal, () => {
  cleanup().then(() => process.exit(1), () => process.exit(1));
});

try {
  check(process.argv.length === 2, "ARGUMENTS");
  check(![".env", ".env.local", ".env.development", ".env.development.local", ".env.production", ".env.production.local"]
    .some((name) => existsSync(join(root, name))), "ENV_FILE");
  check(existsSync(join(root, ".next", "BUILD_ID")), "BUILD_REQUIRED");
  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
  installAcademicG1Base(cluster);
  stage = "APP_START";
  const origin = await start();
  const sessions = { anonymous: undefined };
  for (const name of ["pending", "studentA", "faculty", "admin", "manager"]) sessions[name] = await sessionCookie(origin, name);
  for (const [name, cookie] of Object.entries(sessions)) {
    const anonymous = name === "anonymous", pending = name === "pending";
    await verify(origin, name, cookie, "/admin/login", { status: 200 });
    await verify(origin, name, cookie, "/admin/proxy-denial-probe", anonymous
      ? { status: 302, location: "/admin/login", callback: true }
      : name === "admin" ? { status: 404 }
        : { status: 403, body: "관리자만 접근할 수 있습니다." });
    for (const prefix of ["/resources", "/member", "/mypage"]) {
      await verify(origin, name, cookie, `${prefix}/proxy-denial-probe/missing`, anonymous
        ? { status: 302, location: "/login", callback: true }
        : pending ? { status: 302, location: "/pending" } : { status: 404 });
    }
    await verify(origin, name, cookie, "/admin/academics/proxy-denial-probe", anonymous
      ? { status: 302, location: "/login", callback: true }
      : pending ? { status: 302, location: "/pending" }
        : name === "manager" ? { status: 404 }
          : { status: 403, body: "학사 운영 책임자만 접근할 수 있습니다." });
  }
  check(assertions === 41, "ASSERTION_COUNT");
  check(diagnostics.size === 0, "SERVER_DIAGNOSTICS");
  for (const failure of failures) console.error(`FAIL PROXY_${failure}`);
  check(failures.length === 0, "MATRIX");
  console.log(`PASS PROXY_HTTP_MATRIX:${assertions}`);
} catch (error) {
  console.error(error instanceof Error && /^PROXY_[A-Z0-9_]+$/.test(error.message) ? error.message : "PROXY_GATE_FAILED");
  console.error(`PROXY_STAGE:${stage}`);
  if (error instanceof Error && /^[A-Za-z]+$/.test(error.name)) console.error(`PROXY_ERROR:${error.name}`);
  if (error?.cause && /^[A-Z0-9_]+$/.test(error.cause.code)) console.error(`PROXY_CAUSE:${error.cause.code}`);
  if (app) console.error(`PROXY_PROCESS:${app.exitCode ?? app.signalCode ?? "RUNNING"}`);
  for (const code of diagnostics) console.error(`PROXY_DIAGNOSTIC:${code}`);
  process.exitCode = 1;
} finally { await cleanup(); }
