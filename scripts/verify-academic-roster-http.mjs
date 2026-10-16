/**
 * #146 실제 Next HTTP와 Playwright로 지정 승인자 명부 등록을 검증합니다.
 * 운영 환경 파일 없이 임시 PostgreSQL·합성 계정만 사용하고 쿠키는 임시 0600 파일로 한정합니다.
 * 앱 코드·인증·인가·SQL 함수는 모킹하거나 바꾸지 않습니다.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createQaPostgres, qaPassword, qaUsers } from "../tests/support/resource-qa-postgres.mjs";
import { academicQaCohortId, academicQaOtherFaculty, academicQaUserFingerprint,
  installAcademicIdentityFixture, installAcademicRosterMigrations } from "../tests/support/academic-roster-fixture.mjs";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const check = (condition, label) => { if (!condition) throw new Error(label); };
const identity = { ...qaUsers, OTHER_FACULTY: academicQaOtherFaculty };
const expectedRole = (role) => role === "OTHER_FACULTY" ? "FACULTY" : role;
const routes = ["/admin/academics/students", "/admin/academics/students/new",
  "/admin/academics/students/40000000-0000-4000-8000-000000000146"];
let cluster, activeServer, checks = 0;
const diagnostics = new Set();

/** 실행 환경의 외부 DB·OAuth·Blob·NODE_OPTIONS를 상속하지 않습니다. */
function basicEnvironment() {
  return Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
}

function cookiesFrom(response, cookies = new Map()) {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0];
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return cookies;
}
const cookieHeader = (cookies) => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
function passed(label) { checks++; console.log(`PASS ${label}`); }

/** 다른 개발 서버와 포트를 공유하지 않으며 종료도 이 실행의 프로세스 그룹에만 보냅니다. */
async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve); });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function stopServer() {
  const instance = activeServer;
  activeServer = undefined;
  if (!instance) return;
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    try { process.kill(-instance.process.pid, signal); }
    catch (error) { if (error.code !== "ESRCH") throw new Error("학사 QA 서버 종료 실패"); }
    if (signal === "SIGTERM") await Promise.race([instance.done, delay(5_000)]);
  }
}

async function startServer(enabled) {
  const baseUrl = `http://127.0.0.1:${await availablePort()}`;
  const environment = {
    ...basicEnvironment(), ...cluster.environment, LC_ALL: "C", NODE_ENV: "development",
    AUTH_SECRET: randomBytes(48).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_URL: baseUrl,
    NEXTAUTH_URL: baseUrl, NEXT_PUBLIC_APP_URL: baseUrl, NEXT_TELEMETRY_DISABLED: "1",
    AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "",
    BLOB_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_BLOB_HOST: "",
    ACADEMIC_APPROVER_USER_ID: qaUsers.FACULTY.id, ACADEMIC_ENABLED: enabled ? "true" : "false",
    ACADEMIC_ENROLLMENT_WRITES_ENABLED: "true",
    NODE_OPTIONS: `--import=${JSON.stringify(join(repository, "tests/support/resource-qa-preload.mjs"))}`,
  };
  const server = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "dev", "--webpack",
    "--hostname", "127.0.0.1", "--port", new URL(baseUrl).port], {
    cwd: repository, env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"],
  });
  let exited = false;
  const done = new Promise((resolve) => {
    server.once("error", () => { exited = true; resolve(); });
    server.once("exit", () => { exited = true; resolve(); });
  });
  server.stdout.resume();
  server.stderr.on("data", (chunk) => {
    // 전체 프레임워크 로그에는 SQL·세션이 담길 수 있어 고정 코드만 추출하고 버립니다.
    const text = String(chunk).replace(/\x1b\[[0-9;]*m/g, "");
    for (const match of text.matchAll(/QA_TRANSPORT_FAILURE:([0-9A-Z_]+)/g)) diagnostics.add(match[1]);
    for (const match of text.matchAll(/\[auth\]\[error\]\s*([A-Za-z]+)(?=:)/g)) diagnostics.add(match[1]);
  });
  activeServer = { process: server, done };
  let ready = false;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/csrf`, { signal: AbortSignal.timeout(10_000) });
      await response.body?.cancel();
      if (response.status === 200) { ready = true; break; }
    } catch {
      await delay(200);
      continue;
    }
    await delay(200);
  }
  check(ready, "학사 QA Next 서버 준비 실패");
  return baseUrl;
}

/** 정상 CSRF·credentials 인증으로만 쿠키를 발급받고 실제 DB 세션과 대조합니다. */
async function login(baseUrl, role) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const cookies = cookiesFrom(csrfResponse);
  const csrf = await csrfResponse.json();
  check(typeof csrf.csrfToken === "string", "학사 QA CSRF 발급 실패");
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", signal: AbortSignal.timeout(60_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1",
      Origin: baseUrl, Cookie: cookieHeader(cookies) },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: identity[role].email,
      password: qaPassword, callbackUrl: `${baseUrl}/admin/academics/students` }),
  });
  cookiesFrom(response, cookies); await response.body?.cancel();
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(cookies) } });
  const session = await sessionResponse.json();
  check(session.user?.id === identity[role].id && session.user?.role === expectedRole(role), `학사 QA ${role} 정상 로그인 실패`);
  passed(`${role} 정상 credentials 로그인·DB 세션`);
  return cookies;
}

async function verifyBoundary(baseUrl, sessions, phase) {
  for (const role of ["비로그인", "ADMIN", "MEMBER", "OTHER_FACULTY", "PENDING"]) {
    for (const path of routes) {
      const cookies = sessions[role];
      const response = await fetch(`${baseUrl}${path}`, { redirect: "manual", cache: "no-store",
        headers: cookies ? { Cookie: cookieHeader(cookies) } : {}, signal: AbortSignal.timeout(60_000) });
      const status = response.status;
      const location = response.headers.get("location");
      const expectedLocation = role === "비로그인" ? "/login" : role === "PENDING" ? "/pending" : null;
      const denied = expectedLocation
        ? status === 302 && location && new URL(location, baseUrl).pathname === expectedLocation
        : status === 403;
      await response.body?.cancel();
      check(denied, `학사 QA ${phase} ${role} 직접 접근 차단 실패 (HTTP ${status})`);
      passed(`${phase} ${role} 직접 접근 차단 (${status}, ${routes.indexOf(path) + 1}/3)`);
    }
  }
}

/** 기존 spec을 그대로 실행하며 쿠키 파일·브라우저 산출물은 임시 0700 디렉터리 안에만 둡니다. */
async function runBrowserSpec(baseUrl, approverCookies) {
  const state = join(cluster.root, "academic-state.json");
  const output = join(cluster.root, "playwright-output");
  const config = join(cluster.root, "academic-playwright.config.mjs");
  writeFileSync(state, JSON.stringify({ cookies: [...approverCookies].map(([name, value]) => ({
    name, value, domain: "127.0.0.1", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax",
  })), origins: [] }), { mode: 0o600 });
  check((statSync(state).mode & 0o777) === 0o600, "학사 QA 쿠키 파일 권한 불일치");
  // 프로젝트 설정이 바뀌어도 이번 검증의 trace·스크린샷·영상 기록은 명시적으로 비활성화합니다.
  writeFileSync(config, `export default ${JSON.stringify({
    testDir: join(repository, "tests/e2e"), testMatch: "academic-roster.spec.ts", timeout: 60_000,
    expect: { timeout: 15_000 }, outputDir: output, workers: 1, reporter: [["line"]],
    use: { baseURL: baseUrl, trace: "off", screenshot: "off", video: "off" },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  })};\n`, { mode: 0o600 });
  // 실패를 숨기는 느슨한 selector 대신 폼의 실제 접근 가능한 이름과 시험 기수 선택지를 확인합니다.
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/admin/academics/students/new`);
    const labels = ["표시 이름", "등록할 기수", "본인 확인 방식", "승인 근거 참조 식별자"];
    const counts = await Promise.all(labels.map((label) => page.getByLabel(label, { exact: true }).count()));
    const options = await page.locator(`select[name="cohortId"] option[value="${academicQaCohortId}"]`).count();
    if (counts.some((count) => count !== 1) || options !== 1) {
      labels.forEach((label, index) => console.error(`학사 QA 폼 label ${label}: ${counts[index]}개`));
      console.error(`학사 QA 시험 기수 option: ${options}개`);
      throw new Error("학사 QA 폼 접근 가능한 이름 또는 시험 기수 선택지 불일치");
    }
    passed("실제 Chromium 폼 label·시험 기수 선택지");
  } finally { await browser.close(); }
  const runner = spawn(process.execPath, [join(repository, "node_modules/@playwright/test/cli.js"), "test",
    "--config", config], {
    cwd: repository, env: { ...basicEnvironment(), CI: "true", NEXT_TELEMETRY_DISABLED: "1",
      PLAYWRIGHT_BASE_URL: baseUrl, HRA_ACADEMIC_QA_STATE: state, HRA_ACADEMIC_QA_COHORT_ID: academicQaCohortId },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let transcript = "";
  runner.stdout.on("data", (chunk) => { transcript += String(chunk); });
  runner.stderr.on("data", (chunk) => { transcript += String(chunk); });
  const status = await new Promise((resolve) => {
    // close는 stdout/stderr가 닫힌 뒤 발생하므로 최종 통과 개수까지 읽은 후 판정합니다.
    runner.once("error", () => resolve(-1)); runner.once("close", resolve);
  });
  if (status !== 0) {
    // 이 spec은 합성 명부만 다룹니다. 쿠키·헤더 없이 기대 문구·locator·코드 위치를 남깁니다.
    if (transcript.includes("Executable doesn't exist")) diagnostics.add("CHROMIUM_NOT_INSTALLED");
    if (transcript.includes("Cannot find")) diagnostics.add("BROWSER_MODULE_RESOLUTION");
    if (transcript.includes("Test timeout")) diagnostics.add("BROWSER_TEST_TIMEOUT");
    if (transcript.includes("toContainText")) diagnostics.add("BROWSER_TEXT_ASSERTION");
    for (const match of transcript.matchAll(/academic-roster\.spec\.ts:([0-9]+):[0-9]+/g)) diagnostics.add(`SPEC_LINE_${match[1]}`);
    const readable = transcript.replace(/\x1b\[[0-9;]*m/g, "").split(/\r?\n/).filter((line) =>
      /^\s*(?:Error:|Locator:|Expected|Received|Test timeout|at .*academic-roster\.spec\.ts|[> ]*[0-9]+ \||- )/.test(line) &&
      !/authjs|cookie|secret|token|authorization|set-cookie|headers/i.test(line));
    for (const line of readable.slice(0, 24)) console.error(line.trim());
    const counts = cluster.sql("SELECT (SELECT count(*) FROM academic_students) || ':' || (SELECT count(*) FROM cohort_enrollments) || ':' || (SELECT count(*) FROM academic_roster_registrations)");
    if (/^[0-9]+:[0-9]+:[0-9]+$/.test(counts)) diagnostics.add(`ROWS_${counts.replaceAll(":", "_")}`);
  }
  check(status === 0 && /\b2 passed\b/.test(transcript), "학사 QA Playwright 명부 등록·중복 거부 검증 실패");
  passed("실제 Chromium 비로그인 접근 차단");
  passed("실제 Chromium 신규 등록→목록→기존 UUID 중복 거부→재조회");
}

async function run() {
  check(process.argv.length === 2, "학사 QA 실행기는 인자를 받지 않습니다.");
  check(![".env", ".env.local", ".env.development", ".env.development.local"].some((name) =>
    existsSync(join(repository, name))), "학사 QA는 환경 파일이 없는 격리 worktree에서 실행해야 합니다.");
  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
  installAcademicIdentityFixture(cluster);
  const originalUsers = academicQaUserFingerprint(cluster);
  check(cluster.sql("SELECT to_regclass('public.academic_students') IS NULL") === "t", "학사 QA 비활성 단계에 학사 표가 존재합니다.");
  passed("학사 표 없는 초기 상태 확인");
  let baseUrl = await startServer(false);
  let sessions = {};
  for (const role of Object.keys(identity)) sessions[role] = await login(baseUrl, role);
  await verifyBoundary(baseUrl, sessions, "기능 비활성");
  for (const path of routes) {
    const response = await fetch(`${baseUrl}${path}`, { headers: { Cookie: cookieHeader(sessions.FACULTY) }, redirect: "manual" });
    const body = await response.text();
    check(response.status === 200 && body.includes("학사관리 준비 중"), "학사 QA 승인자 비활성 준비 안내 실패");
    passed(`학사 표 없는 승인자 준비 안내 (${routes.indexOf(path) + 1}/3)`);
  }
  check(cluster.sql("SELECT to_regclass('public.academic_students') IS NULL") === "t", "학사 QA 비활성 중 학사 표가 생성됐습니다.");
  await stopServer();

  installAcademicRosterMigrations(cluster);
  passed("#144→#145→#146 실제 SQL migration 적용");
  baseUrl = await startServer(true);
  sessions = {};
  for (const role of Object.keys(identity)) sessions[role] = await login(baseUrl, role);
  await verifyBoundary(baseUrl, sessions, "기능 활성");
  await runBrowserSpec(baseUrl, sessions.FACULTY);
  check(cluster.sql("SELECT (SELECT count(*) FROM academic_students) || ':' || (SELECT count(*) FROM cohort_enrollments) || ':' || (SELECT count(*) FROM academic_roster_registrations)") === "1:1:1",
    "학사 QA 신규·중복 시도 후 학생·학적·감사 행 수 불일치");
  check(cluster.sql("SELECT count(*) FROM academic_students WHERE user_id IS NULL") === "1", "학사 QA 자동 계정 연결이 발생했습니다.");
  check(cluster.sql(`SELECT count(*) FROM academic_roster_registrations WHERE actor_user_id = '${qaUsers.FACULTY.id}'`) === "1",
    "학사 QA 등록 감사의 실제 승인자 불일치");
  passed("학생·학적·승인 감사 각 1건 및 계정 미연결 확인");
  check(academicQaUserFingerprint(cluster) === originalUsers, "학사 QA 사용자 역할·기수·로그인 정보가 변경됐습니다.");
  passed("기존 사용자 역할·기수·로그인 정보 보존");
  check(cluster.sql("SELECT count(*) FROM rate_limit_events") === "0", "학사 QA 성공 로그인 요청 제한 예약이 남았습니다.");
  passed("실제 요청 제한 함수·성공 예약 삭제");
  console.log(`학사 명부 HTTP·브라우저 QA ${checks}건 통과. 쿠키·trace·스크린샷은 보관하지 않습니다.`);
}

try { await run(); }
catch (error) {
  console.error(error instanceof Error && /^(학사 QA|격리 PostgreSQL|격리 쿼리)/.test(error.message)
    ? error.message : "학사 QA 실행 실패: 입력·실행 환경을 확인하세요.");
  if (diagnostics.size) console.error(`학사 QA 진단 코드: ${[...diagnostics].join(", ")}`);
  process.exitCode = 1;
} finally {
  try { await stopServer(); }
  finally { cluster?.close(); }
}
