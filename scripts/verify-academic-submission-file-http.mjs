/**
 * 개인 제출 파일의 실제 Next HTTP·credentials 세션·현재 DB 인가·전달 허가 감사를 검증합니다.
 * 운영 DB와 환경 파일은 읽지 않으며, 기본 모드는 전용 비민감 private PDF 실물까지 요구합니다.
 * --authorization-only는 저장소 연결 전 점검이며 실물 200 검증 완료를 대신하지 않습니다.
 */
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { createQaPostgres, qaPassword } from "../tests/support/resource-qa-postgres.mjs";
import { resourceQaPdfSha256 } from "../tests/support/resource-qa-pdf.mjs";
import { defaultQaSubmissionKey, fileQaIdentities, fileQaIds, installSubmissionFileIdentities,
  installSubmissionFileMigrations, seedSubmissionFileRows } from "../tests/support/academic-submission-file-fixture.mjs";

const repository = dirname(dirname(fileURLToPath(import.meta.url)));
const arguments_ = process.argv.slice(2);
const authorizationOnly = arguments_.length === 1 && arguments_[0] === "--authorization-only";
const check = (condition, label) => { if (!condition) throw new Error(label); };
const passed = (label) => { checks++; console.log(`PASS ${label}`); };
const expectedRole = { owner: "MEMBER", peer: "MEMBER", otherCohort: "MEMBER", approver: "FACULTY", otherFaculty: "FACULTY", admin: "ADMIN", pending: "PENDING" };
let cluster, activeServer, fixture, enabled = false, checks = 0;
const diagnostics = new Set();

function baseEnvironment() {
  return Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"]
    .filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
}
function cookiesFrom(response, cookies = new Map()) {
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0], separator = pair.indexOf("=");
    if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  return cookies;
}
const cookieHeader = (cookies) => [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
const auditCount = () => enabled ? Number(cluster.sql("SELECT count(*) FROM academic_submission_file_reads")) : 0;

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
    catch (error) { if (error.code !== "ESRCH") throw new Error("개인 파일 QA 서버 종료 실패"); }
    if (signal === "SIGTERM") await Promise.race([instance.done, delay(5_000)]);
  }
}

async function startServer(privateInput) {
  const baseUrl = `http://127.0.0.1:${await availablePort()}`;
  const server = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "dev", "--webpack",
    "--hostname", "127.0.0.1", "--port", new URL(baseUrl).port], {
    cwd: repository, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...baseEnvironment(), ...cluster.environment, LC_ALL: "C", NODE_ENV: "development",
      AUTH_SECRET: randomBytes(48).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_URL: baseUrl,
      NEXTAUTH_URL: baseUrl, NEXT_PUBLIC_APP_URL: baseUrl, NEXT_TELEMETRY_DISABLED: "1",
      AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "",
      BLOB_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_BLOB_HOST: "",
      ACADEMIC_ENABLED: enabled ? "true" : "false", ACADEMIC_APPROVER_USER_ID: fileQaIdentities.approver.id,
      ...privateInput, NODE_OPTIONS: `--import=${JSON.stringify(join(repository, "tests/support/resource-qa-preload.mjs"))}` },
  });
  let exited = false;
  const done = new Promise((resolve) => {
    server.once("error", () => { exited = true; resolve(); }); server.once("exit", () => { exited = true; resolve(); });
  });
  server.stdout.resume();
  server.stderr.on("data", (chunk) => {
    const text = String(chunk).replace(/\x1b\[[0-9;]*m/g, "");
    for (const match of text.matchAll(/QA_TRANSPORT_FAILURE:([0-9A-Z_]+)/g)) diagnostics.add(match[1]);
  });
  activeServer = { process: server, done };
  let ready = false;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline && !exited) {
    try {
      const response = await fetch(`${baseUrl}/api/auth/csrf`, { signal: AbortSignal.timeout(10_000) });
      await response.body?.cancel();
      if (response.status === 200) { ready = true; break; }
    } catch { await delay(200); continue; }
    await delay(200);
  }
  check(ready, "개인 파일 QA Next 서버 준비 실패");
  return baseUrl;
}

async function login(baseUrl, name) {
  const csrfResponse = await fetch(`${baseUrl}/api/auth/csrf`);
  const cookies = cookiesFrom(csrfResponse), csrf = await csrfResponse.json();
  check(typeof csrf.csrfToken === "string", "개인 파일 QA CSRF 발급 실패");
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded",
      "X-Auth-Return-Redirect": "1", Origin: baseUrl, Cookie: cookieHeader(cookies) },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, email: fileQaIdentities[name].email,
      password: qaPassword, callbackUrl: `${baseUrl}/mypage` }),
  });
  cookiesFrom(response, cookies); await response.body?.cancel();
  const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, { headers: { Cookie: cookieHeader(cookies) } });
  const session = await sessionResponse.json();
  check(session.user?.id === fileQaIdentities[name].id && session.user?.role === expectedRole[name], `개인 파일 QA ${name} 정상 로그인 실패`);
  passed(`${name} 정상 credentials 로그인·DB 세션`);
  return cookies;
}

/** 응답·감사 개수만 비교하고 URL·헤더·쿠키·파일 내용은 출력하거나 저장하지 않습니다. */
async function requestFile(baseUrl, label, cookies, expected, selected = fixture?.owner, audit = expected === "allow") {
  const before = auditCount();
  const ids = selected || { submissionId: "90000000-0000-4000-8000-000000000001", fileId: "90000000-0000-4000-8000-000000000002" };
  const response = await fetch(`${baseUrl}/api/academic/submissions/${ids.submissionId}/file/${ids.fileId}?url=https://attacker.invalid/not-used.pdf`, {
    redirect: "manual", cache: "no-store", headers: cookies ? { Cookie: cookieHeader(cookies) } : {}, signal: AbortSignal.timeout(60_000),
  });
  const status = expected === "allow" ? (authorizationOnly ? 503 : 200) : expected;
  check(response.status === status, `개인 파일 QA ${label}: HTTP ${response.status}, 기대 ${status}`);
  check(response.headers.get("cache-control") === "private, no-store", `개인 파일 QA ${label}: 캐시 헤더 불일치`);
  check(response.headers.get("x-content-type-options") === "nosniff", `개인 파일 QA ${label}: nosniff 누락`);
  let text = "";
  if (status === 200) {
    const bytes = Buffer.from(await response.arrayBuffer());
    check(createHash("sha256").update(bytes).digest("hex") === resourceQaPdfSha256(), `개인 파일 QA ${label}: PDF 해시 불일치`);
    check(response.headers.get("content-type") === "application/octet-stream", `개인 파일 QA ${label}: 보수적 콘텐츠 형식 불일치`);
    check(response.headers.get("content-disposition")?.startsWith("attachment;") &&
      response.headers.get("content-disposition").includes("filename*=UTF-8''"), `개인 파일 QA ${label}: 파일명 인코딩 누락`);
  } else {
    text = await response.text();
    check(!text.includes("academic-uploads/") && !text.includes("blob.vercel-storage.com"), `개인 파일 QA ${label}: 저장 경로 노출`);
  }
  check(auditCount() - before === (audit && enabled ? 1 : 0), `개인 파일 QA ${label}: 전달 허가 감사 개수 불일치`);
  passed(`${label} (${status})`);
  return text;
}

async function run() {
  check(arguments_.length === 0 || authorizationOnly, "개인 파일 QA는 --authorization-only만 지원합니다.");
  check(![".env", ".env.local", ".env.development", ".env.development.local"].some((name) => existsSync(join(repository, name))),
    "개인 파일 QA는 환경 파일이 없는 격리 worktree에서 실행해야 합니다.");
  let storageKey = defaultQaSubmissionKey;
  const privateInput = { ACADEMIC_SUBMISSION_BLOB_HOST: "", ACADEMIC_SUBMISSION_READ_WRITE_TOKEN: "" };
  if (!authorizationOnly) {
    storageKey = process.env.HRA_QA_SUBMISSION_STORAGE_KEY;
    const host = process.env.ACADEMIC_SUBMISSION_BLOB_HOST, token = process.env.ACADEMIC_SUBMISSION_READ_WRITE_TOKEN;
    check(typeof storageKey === "string" && /^academic-uploads\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/document\.pdf$/.test(storageKey) &&
      typeof host === "string" && /^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host) && token,
    "개인 파일 QA 전용 private PDF 키·호스트·토큰이 필요합니다.");
    privateInput.ACADEMIC_SUBMISSION_BLOB_HOST = host;
    privateInput.ACADEMIC_SUBMISSION_READ_WRITE_TOKEN = token;
    const direct = await fetch(`https://${host}/${storageKey}`, { redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(30_000) });
    check(direct.status === 403, "개인 파일 QA 토큰 없는 private 직접 접근은 403이어야 합니다.");
    await direct.body?.cancel(); passed("private 직접 URL 비로그인 차단");
  }
  cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN);
  installSubmissionFileIdentities(cluster);
  let baseUrl = await startServer(privateInput), sessions = {};
  for (const name of Object.keys(fileQaIdentities)) sessions[name] = await login(baseUrl, name);
  await requestFile(baseUrl, "비활성 비로그인", null, 401);
  await requestFile(baseUrl, "비활성 본인 MEMBER", sessions.owner, 404);
  await requestFile(baseUrl, "비활성 지정 승인자", sessions.approver, 404);
  for (const name of ["admin", "otherFaculty", "pending"]) await requestFile(baseUrl, `비활성 ${name}`, sessions[name], 403);
  check(cluster.sql("SELECT to_regclass('academic_students') IS NULL") === "t", "개인 파일 QA 비활성 중 학사 표가 생성됐습니다.");
  passed("학사 표 없는 비활성 gate");
  await stopServer();
  installSubmissionFileMigrations(cluster);
  fixture = seedSubmissionFileRows(cluster, storageKey); enabled = true;
  baseUrl = await startServer(privateInput); sessions = {};
  for (const name of Object.keys(fileQaIdentities)) sessions[name] = await login(baseUrl, name);
  await requestFile(baseUrl, "비로그인 파일 요청", null, 401);
  for (const name of ["admin", "otherFaculty", "pending"]) await requestFile(baseUrl, `미지정 ${name}`, sessions[name], 403);
  const denied = await requestFile(baseUrl, "같은 기수 타 학생", sessions.peer, 404);
  const absent = await requestFile(baseUrl, "없는 파일", sessions.owner, 404,
    { submissionId: fixture.owner.submissionId, fileId: "90000000-0000-4000-8000-000000000001" });
  check(denied === absent, "개인 파일 QA 미소유와 없는 파일의 404 본문 불일치");
  await requestFile(baseUrl, "다른 기수 학생", sessions.otherCohort, 404);
  await requestFile(baseUrl, "본인에게 없는 타인 제출", sessions.owner, 404, fixture.peer);
  await requestFile(baseUrl, "본인 제출의 다른 파일 ID", sessions.owner, 404,
    { submissionId: fixture.owner.submissionId, fileId: fixture.peer.fileId });
  await requestFile(baseUrl, "본인 활성 MEMBER 파일", sessions.owner, "allow");
  await requestFile(baseUrl, "정확 지정 FACULTY 관리 grant", sessions.approver, "allow");
  await requestFile(baseUrl, "쿠키 없는 같은 링크 재요청", null, 401);
  cluster.sql(`UPDATE cohort_enrollments SET ended_at=clock_timestamp() WHERE id='${fileQaIds.enrollment}'`);
  await requestFile(baseUrl, "학적 종료 직후 본인", sessions.owner, 404);
  await requestFile(baseUrl, "학적 종료 보존 제출 관리", sessions.approver, "allow");
  cluster.sql(`UPDATE cohort_enrollments SET ended_at=NULL WHERE id='${fileQaIds.enrollment}'`);
  cluster.sql(`ALTER TABLE academic_students DISABLE TRIGGER academic_submission_binding_guard;
    UPDATE academic_students SET user_id=NULL WHERE id='${fileQaIds.student}';
    ALTER TABLE academic_students ENABLE TRIGGER academic_submission_binding_guard;`);
  await requestFile(baseUrl, "방어적 연결 해제 직후 본인", sessions.owner, 404);
  await requestFile(baseUrl, "연결 해제 보존 제출 관리", sessions.approver, "allow");
  cluster.sql(`ALTER TABLE academic_students DISABLE TRIGGER academic_submission_binding_guard;
    UPDATE academic_students SET user_id='${fileQaIdentities.owner.id}' WHERE id='${fileQaIds.student}';
    ALTER TABLE academic_students ENABLE TRIGGER academic_submission_binding_guard;`);
  cluster.sql(`UPDATE assignments SET status='CLOSED' WHERE id='${fileQaIds.assignment}'`);
  await requestFile(baseUrl, "CLOSED 본인 최종 제출", sessions.owner, "allow");
  cluster.sql(`UPDATE users SET role='PENDING' WHERE id='${fileQaIdentities.owner.id}'`);
  await requestFile(baseUrl, "역할 강등 기존 쿠키", sessions.owner, 403);
  cluster.sql(`UPDATE users SET role='MEMBER',session_version=session_version+1 WHERE id='${fileQaIdentities.owner.id}'`);
  await requestFile(baseUrl, "세션 버전 변경 기존 쿠키", sessions.owner, 401);
  sessions.owner = await login(baseUrl, "owner");
  cluster.sql("CREATE FUNCTION qa_fail_file_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'qa_audit_failed'; END $$; CREATE TRIGGER qa_fail_file_audit BEFORE INSERT ON academic_submission_file_reads FOR EACH ROW EXECUTE FUNCTION qa_fail_file_audit();");
  try { await requestFile(baseUrl, "감사 INSERT 실패 시 파일 거부", sessions.owner, 503, fixture.owner, false); }
  finally { cluster.sql("DROP TRIGGER qa_fail_file_audit ON academic_submission_file_reads; DROP FUNCTION qa_fail_file_audit();"); }
  check(cluster.sql("SELECT count(*) FROM rate_limit_events") === "0", "개인 파일 QA 성공 로그인 예약이 남았습니다.");
  passed("실제 로그인 요청 제한 예약 삭제");
  console.log(authorizationOnly
    ? `개인 파일 인증·인가 HTTP ${checks}건 통과. 허용 경로의 private 실물 200은 기본 모드에서 검증해야 합니다.`
    : `개인 제출 파일 실물 HTTP ${checks}건 통과. URL·키·쿠키·토큰·파일 본문은 출력하지 않았습니다.`);
}

try { await run(); }
catch (error) {
  console.error(error instanceof Error && /^(개인 파일 QA|격리 PostgreSQL)/.test(error.message)
    ? error.message : "개인 파일 QA 실행 실패: 입력·실행 환경을 확인하세요.");
  if (diagnostics.size) console.error(`개인 파일 QA 진단 코드: ${[...diagnostics].join(", ")}`);
  process.exitCode = 1;
} finally {
  try { await stopServer(); }
  finally { cluster?.close(); }
}
