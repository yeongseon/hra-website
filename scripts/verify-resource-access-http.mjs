/**
 * #101 자료 접근을 실제 Next HTTP·credentials 세션·격리 PostgreSQL로 검증합니다.
 * 기본 실행은 전용 private Blob의 200 응답과 해시까지 필수이며 운영 DB는 접속하지 않습니다.
 * --authorization-only는 저장소 연결 전 인증·인가 점검용으로, 이슈 완료 증거를 대신하지 않습니다.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createQaPostgres, installQaFixture, qaPassword, qaResourceIds, qaUsers } from "../tests/support/resource-qa-postgres.mjs";
import { resourceQaPdfSha256 } from "../tests/support/resource-qa-pdf.mjs";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const authorizationOnly = args.length === 1 && args[0] === "--authorization-only";
const check = (condition, message) => { if (!condition) throw new Error(message); };
let cluster, server, serverDone, serverExit;
let checks = 0;
const failureTags = new Set();

/** 쿠키는 메모리에서만 보관하며 HTTP 응답·오류·검증 출력에 포함하지 않습니다. */
function collectCookies(response, cookies = new Map()) {
  for (const entry of response.headers.getSetCookie()) {
    const pair = entry.slice(0, entry.indexOf(";"));
    const separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return cookies;
}
const cookieHeader = (cookies) => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");

/** 외부 자격 증명·NODE_OPTIONS를 그대로 상속하지 않고 실행에 필요한 항목만 허용합니다. */
function nextEnvironment(baseUrl, privateInput) {
  const inherited = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  return {
    ...inherited, ...cluster.environment, NODE_ENV: "development", LC_ALL: "C",
    NEXT_TELEMETRY_DISABLED: "1", AUTH_SECRET: randomBytes(48).toString("hex"),
    AUTH_TRUST_HOST: "true", AUTH_URL: baseUrl, NEXTAUTH_URL: baseUrl, NEXT_PUBLIC_APP_URL: baseUrl,
    AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "",
    BLOB_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_BLOB_ENABLED: "true", ...privateInput,
    NODE_OPTIONS: `--import=${JSON.stringify(join(repository, "tests/support/resource-qa-preload.mjs"))}`,
  };
}

/** 동적 포트를 사용해 기존 개발 서버에 요청하거나 종료 신호를 보내지 않습니다. */
async function availablePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once("error", reject); listener.listen(0, "127.0.0.1", resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}

async function run() {
  check(args.length === 0 || authorizationOnly, "인자는 --authorization-only만 지원합니다.");
  // Next 자동 환경 파일 로드로 운영 비밀값이 섞이지 않게 파일이 없는 격리 worktree에서만 실행합니다.
  check(![".env", ".env.local", ".env.development", ".env.development.local"].some((name) =>
    existsSync(join(repository, name))), "환경 파일이 없는 격리 worktree에서 실행해야 합니다.");

  let blobUrl = "https://resource-qa.private.blob.vercel-storage.com/qa/resource-access-http/unconnected.pdf";
  const privateInput = { RESOURCE_PRIVATE_BLOB_HOST: "resource-qa.private.blob.vercel-storage.com", RESOURCE_PRIVATE_READ_WRITE_TOKEN: "" };
  if (!authorizationOnly) {
    blobUrl = process.env.HRA_QA_PRIVATE_BLOB_URL;
    const host = process.env.RESOURCE_PRIVATE_BLOB_HOST;
    const token = process.env.RESOURCE_PRIVATE_READ_WRITE_TOKEN;
    check(typeof blobUrl === "string" && host && token, "전용 QA private Blob 입력이 필요합니다.");
    const parsed = new URL(blobUrl);
    check(parsed.protocol === "https:" && parsed.hostname === host &&
      /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host) &&
      parsed.pathname.startsWith("/qa/resource-access-http/") && parsed.pathname.endsWith(".pdf") &&
      !parsed.username && !parsed.password && !parsed.search && !parsed.hash,
    "전용 QA private PDF의 정확한 호스트·경로가 필요합니다.");
    check(!process.env.HRA_QA_PRIVATE_BLOB_SHA256 ||
      process.env.HRA_QA_PRIVATE_BLOB_SHA256 === resourceQaPdfSha256(), "QA PDF 기준 해시가 일치하지 않습니다.");
    privateInput.RESOURCE_PRIVATE_BLOB_HOST = host;
    privateInput.RESOURCE_PRIVATE_READ_WRITE_TOKEN = token;
    const direct = await fetch(blobUrl, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    check(direct.status === 403, "private 파일의 토큰 없는 직접 접근이 403이어야 합니다.");
    await direct.body?.cancel(); checks++;
    console.log("PASS private 파일 직접 접근 차단");
  }

  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
  installQaFixture(cluster, blobUrl);
  const port = await availablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repository, env: nextEnvironment(baseUrl, privateInput), detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // 프레임워크 오류에도 쿠키·SQL·URL이 포함될 수 있으므로 원문은 저장하거나 출력하지 않습니다.
  server.stdout.resume();
  server.stderr.on("data", (chunk) => {
    const text = String(chunk).replace(/\x1b\[[0-9;]*m/g, "");
    for (const match of text.matchAll(/QA_TRANSPORT_FAILURE:([0-9A-Z_]+)/g)) failureTags.add(match[1]);
    for (const match of text.matchAll(/\[auth\]\[error\]\s*([A-Za-z]+)(?=:)/g)) failureTags.add(match[1]);
    if (text.includes("QA에서 외부 DB 연결을 차단했습니다.")) failureTags.add("EXTERNAL_DB_BLOCKED");
  });
  serverDone = new Promise((resolve) => {
    server.once("error", () => { serverExit = "시작 오류"; resolve(); });
    server.once("exit", (code) => { serverExit = code; resolve(); });
  });
  const readyDeadline = Date.now() + 120_000;
  let ready = false;
  while (Date.now() < readyDeadline && serverExit === undefined) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/csrf`, { signal: AbortSignal.timeout(10_000) });
      if (response.status === 200) { await response.body?.cancel(); ready = true; break; }
      await response.body?.cancel();
    } catch {
      // 서버 준비 전 연결 실패는 진단 코드만 남기고 제한된 기한 안에 다시 확인합니다.
      failureTags.add("STARTUP_RETRY");
      await delay(200);
      continue;
    }
    await delay(200);
  }
  check(ready, "격리 Next 서버 준비 실패");

  /** 정상 CSRF와 credentials 프로바이더로만 세션을 발급합니다. */
  async function login(role) {
    const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
    const cookies = collectCookies(csrfResponse);
    const csrf = await csrfResponse.json();
    check(typeof csrf.csrfToken === "string", "CSRF 발급 실패");
    const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(60_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1", Origin: baseUrl, Cookie: cookieHeader(cookies) },
      body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: qaUsers[role].email,
        password: qaPassword, callbackUrl: `${baseUrl}/mypage` }),
    });
    collectCookies(response, cookies);
    const loginBody = await response.json().catch(() => ({}));
    const loginError = typeof loginBody.url === "string" ? new URL(loginBody.url, baseUrl).searchParams.get("error") : null;
    if (["CredentialsSignin", "MissingCSRF", "Configuration", "AccessDenied"].includes(loginError)) failureTags.add(loginError);
    check([...cookies.keys()].some((name) => name === "authjs.session-token" || name.startsWith("authjs.session-token.")), `${role} 정상 로그인 실패`);
    const cookie = cookieHeader(cookies);
    const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookie } });
    const session = await sessionResponse.json();
    check(session.user?.id === qaUsers[role].id && session.user?.role === role, `${role} 실제 DB 세션 확인 실패`);
    checks++; console.log(`PASS ${role} 정상 credentials 로그인·DB 세션`);
    return cookie;
  }

  /** redirect를 따라가지 않아 거부 응답과 파일 바이트를 정확히 구분합니다. */
  async function resource(label, key, cookie, expected, inline = false) {
    const kind = key === "guidebook" ? "guidebooks" : "class-materials";
    const response = await fetch(`${baseUrl}/api/resources/${kind}/${qaResourceIds[key]}/download${inline ? "?inline=1" : ""}`, {
      redirect: "manual", cache: "no-store", headers: cookie ? { Cookie: cookie } : {}, signal: AbortSignal.timeout(60_000),
    });
    const status = expected === "allow" ? (authorizationOnly ? 502 : 200) : typeof expected === "number" ? expected : 307;
    check(response.status === status, `${label}: 예상 HTTP 상태 불일치`);
    if (typeof expected === "string" && expected.startsWith("/")) {
      check(new URL(response.headers.get("location"), baseUrl).pathname === expected, `${label}: 이동 경로 불일치`);
    }
    if (expected === "allow" && !authorizationOnly) {
      const body = Buffer.from(await response.arrayBuffer());
      check(createHash("sha256").update(body).digest("hex") === resourceQaPdfSha256(), `${label}: 실물 파일 해시 불일치`);
      check(response.headers.get("cache-control") === "private, no-store", `${label}: 캐시 금지 헤더 누락`);
      check(response.headers.get("x-content-type-options") === "nosniff", `${label}: nosniff 누락`);
      check(response.headers.get("content-type") === "application/pdf", `${label}: PDF 콘텐츠 형식 불일치`);
      check(response.headers.get("content-disposition")?.startsWith(inline ? "inline;" : "attachment;"), `${label}: 다운로드 헤더 누락`);
    } else await response.body?.cancel();
    checks++; console.log(`PASS ${label} (${status})`);
  }

  for (const key of ["student", "faculty", "guidebook"]) await resource(`비로그인 ${key}`, key, null, "/login");
  const sessions = {};
  for (const role of ["PENDING", "MEMBER", "FACULTY", "ADMIN"]) {
    sessions[role] = await login(role);
    for (const key of ["student", "faculty", "guidebook"]) {
      const expected = role === "PENDING" ? "/pending" : role === "MEMBER" && key === "faculty" ? 404 : "allow";
      await resource(`${role} ${key}`, key, sessions[role], expected);
    }
  }
  check(cluster.sql("SELECT count(*) FROM rate_limit_events") === "0", "성공 로그인 예약 DELETE 미반영");
  checks++; console.log("PASS 실제 로그인 예약 함수·성공 예약 DELETE");
  for (const key of ["student", "faculty", "guidebook"]) await resource(`쿠키 없는 공유 링크 ${key}`, key, null, "/login");
  await resource("PDF 인라인 미리보기", "student", sessions.MEMBER, "allow", true);
  await resource("PDF 인라인 쿠키 없는 재요청", "student", null, "/login", true);

  cluster.sql(`UPDATE users SET role = 'MEMBER' WHERE id = '${qaUsers.FACULTY.id}'`);
  await resource("역할 변경 직후 기존 교수 쿠키 학생용", "student", sessions.FACULTY, "allow");
  await resource("역할 변경 직후 기존 교수 쿠키 교수용", "faculty", sessions.FACULTY, 404);
  cluster.sql(`UPDATE users SET role = 'PENDING' WHERE id = '${qaUsers.MEMBER.id}'`);
  await resource("승인 취소 직후 기존 회원 쿠키", "student", sessions.MEMBER, "/pending");
  cluster.sql(`UPDATE users SET session_version = session_version + 1 WHERE id = '${qaUsers.ADMIN.id}'`);
  await resource("세션 버전 변경 직후 기존 관리자 쿠키", "student", sessions.ADMIN, "/login");
  cluster.sql(`DELETE FROM users WHERE id = '${qaUsers.MEMBER.id}'`);
  await resource("계정 삭제 직후 기존 회원 쿠키", "student", sessions.MEMBER, "/login");

  console.log(authorizationOnly
    ? `인증·인가 준비 검증 ${checks}건 통과. private 실물 200 검증은 기본 모드로 실행해야 합니다.`
    : `자료 접근 실물 HTTP 검증 ${checks}건 통과. 쿠키·토큰·파일 URL은 저장하지 않았습니다.`);
}

try { await run(); }
catch (error) {
  // 검사에서 직접 만든 설명 외에 외부 라이브러리 오류 원문은 유출하지 않습니다.
  const safe = error instanceof Error && /^(격리|전용|QA |private |인자|환경 |HRA_|CSRF |PENDING |MEMBER |FACULTY |ADMIN |비로그인 |쿠키 없는 |역할 변경 |승인 취소 |세션 버전 |계정 삭제 |성공 로그인)/.test(error.message);
  console.error(safe ? error.message : "자료 접근 QA 실행 실패: 입력·실행 환경을 확인하세요.");
  if (failureTags.size) console.error(`격리 전송 진단 코드: ${[...failureTags].join(", ")}`);
  process.exitCode = 1;
} finally {
  if (server?.pid) {
    try { process.kill(-server.pid, "SIGTERM"); } catch (error) {
      if (error.code !== "ESRCH") { console.error("격리 Next 서버 종료 신호 전송 실패"); process.exitCode = 1; }
    }
    if (serverDone) await Promise.race([serverDone, delay(5_000)]);
    try { process.kill(-server.pid, "SIGKILL"); } catch (error) {
      if (error.code !== "ESRCH") { console.error("격리 Next 자식 프로세스 종료 확인 실패"); process.exitCode = 1; }
    }
  }
  cluster?.close();
}
