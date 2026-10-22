/**
 * 합성 계정과 일회용 PostgreSQL로 production 인증 호출·논리 Neon POST를 측정합니다.
 * 인원 프로필은 직렬 계정 순회이며 동시 사용자나 운영 용량을 나타내지 않습니다.
 * 원본 HTTP·SQL·쿠키·계정 식별자는 출력하지 않고 메모리에서만 검사합니다.
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createQaPostgres } from "../tests/support/resource-qa-postgres.mjs";
import { academicG1Actors, academicG1Ids, installSiteRouteFixture, siteRoutePassword } from "../tests/support/site-route-fixture.mjs";
import { assertAuthMeasurementSources } from "../tests/support/auth-measurement-core.mjs";
import { summarizeMeasurements } from "../tests/support/auth-measurement-stats.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const basic = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TMP", "TEMP", "SYSTEMROOT"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
const controller = new AbortController(), children = new Map(), runs = [], diagnostics = new Set();
let output, baselineRoot, baselineParent, baselineAdded = false, baselineLinked = false, complete = false, cleanupComplete = true, stage = "INPUT";
const check = (value, code = "CHECK") => { if (!value) throw new Error(`AUTH_MEASURE_${code}`); };
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const interrupt = () => { controller.abort(); diagnostics.add("AUTH_MEASURE_INTERRUPTED"); };
process.once("SIGINT", interrupt); process.once("SIGTERM", interrupt);
const timeout = setTimeout(() => { diagnostics.add("AUTH_MEASURE_RUN_TIMEOUT"); controller.abort(); }, 30 * 60_000); timeout.unref();
/** 하위 명령 출력은 폐기하고 고정 오류 코드만 전달합니다. */
function command(program, args, cwd = root, environment = basic) {
  const result = spawnSync(program, args, { cwd, env: environment, encoding: "utf8", timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  check(result.status === 0 && !result.error, "COMMAND_FAILED"); return result.stdout.trim();
}
/** 소유한 프로세스 그룹만 유한 TERM/KILL 절차로 정리합니다. */
async function stop(child) {
  const alive = () => { try { process.kill(-child.pid, 0); return true; } catch { return false; } };
  for (const [signal, wait] of [["SIGTERM", 5000], ["SIGKILL", 2000]]) {
    if (!child.pid || !alive()) break;
    try { process.kill(-child.pid, signal); } catch { /* 종료 경합은 다음 존재 검사에서 확인합니다. */ }
    const until = Date.now() + wait; while (alive() && Date.now() < until) await delay(50);
  }
  if (child.pid && alive()) { cleanupComplete = false; diagnostics.add("AUTH_MEASURE_PROCESS_CLEANUP"); }
  children.delete(child);
}
/** 빌드·앱의 stdout/stderr는 연결 정보 유출을 막기 위해 모두 폐기합니다. */
function launch(args, cwd, env) {
  const child = spawn(process.execPath, args, { cwd, env, detached: true, stdio: "ignore" });
  const done = new Promise(resolveDone => { child.once("error", () => resolveDone(-1)); child.once("exit", code => resolveDone(code)); });
  children.set(child, done); return child;
}
/** 쿠키는 HTTP 호출에만 사용하고 저장 파일에 직렬화하지 않습니다. */
function cookiesFrom(response, jar) {
  for (const header of response.headers.getSetCookie()) { const pair = header.split(";", 1)[0], at = pair.indexOf("="); if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1)); }
}
const cookieString = jar => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
/** 측정 범위는 전체 응답 본문 소비까지이며 모든 요청에 제한 시간을 둡니다. */
async function request(origin, path, cookie = "", options = {}, milliseconds = 45000) {
  const response = await fetch(origin + path, { redirect: "manual", ...options, headers: { ...(cookie ? { Cookie: cookie } : {}), ...options.headers }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(milliseconds)]) });
  const body = await response.text(); return { response, body };
}

/** 한 앱과 독립 임시 DB를 구성하고 검사 완료 후 반드시 정리합니다. */
async function measure(repository, label, options) {
  let cluster, server;
  const samples = []; let key = 0;
  const result = { profile: label, samplesPerScenario: options.samples, population: options.population, complete: false, cleanupComplete: false, regressions: {}, scenarios: [] };
  runs.push(result);
  try {
    check(!readdirSync(repository).some(name => name === ".env" || /^\.env\.(?:local|development|production|test)(?:\.local)?$/.test(name)), "ENV_FILE");
    stage = "SCHEMA";
    const schema = command(process.execPath, [join(repository, "node_modules/drizzle-kit/bin.cjs"), "export", "--dialect", "postgresql", "--schema", "./src/lib/db/schema.ts"], repository);
    check(schema.includes('CREATE TABLE "users"'), "SCHEMA");
    cluster = createQaPostgres(process.env.HRA_TEST_PG_BIN); installSiteRouteFixture(cluster, repository, schema);
    const generated = Array.from({ length: Math.max(2, options.population - 7) }, (_, index) => ({ id: randomUUID(), name: `인증 측정 합성 ${index + 1}`, email: `auth-${index + 1}@measurement.invalid`, role: "MEMBER" }));
    for (const user of generated) cluster.sql(`INSERT INTO users(id,name,email,password_hash,role) SELECT '${user.id}','${user.name}','${user.email}',password_hash,'MEMBER' FROM users WHERE id='${academicG1Actors.studentA.id}';`);
    const users = JSON.parse(cluster.sql("SELECT json_agg(row_to_json(u)) FROM (SELECT id,name,email,role FROM users ORDER BY id) u;"));
    const byId = new Map(users.map(user => [user.id, user]));
    const actor = Object.fromEntries(Object.entries(academicG1Actors).map(([name, user]) => [name, byId.get(user.id)]));
    const population = [actor.studentA, ...generated.map(user => byId.get(user.id)), actor.peerA, actor.studentB, actor.admin, actor.manager, actor.faculty, actor.pending].slice(0, options.population);
    const listener = createServer(); await new Promise((resolveReady, reject) => { listener.once("error", reject); listener.listen(0, "127.0.0.1", resolveReady); });
    const port = listener.address().port; await new Promise(resolveClosed => listener.close(resolveClosed));
    const origin = `http://localhost:${port}`;
    const contextFile = join(cluster.root, "auth-measurement-context.json");
    const context = (sampleKey = 0, hint = "ROUTE") => { writeFileSync(contextFile + ".new", JSON.stringify({ sampleKey, hint }), { mode: 0o600 }); renameSync(contextFile + ".new", contextFile); };
    context();
    const environment = { ...basic, ...cluster.environment, LC_ALL: "C", NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", HRA_SITE_ROUTE_ORIGIN: origin,
      AUTH_SECRET: randomBytes(48).toString("hex"), AUTH_TRUST_HOST: "true", AUTH_URL: origin, NEXTAUTH_URL: origin, NEXT_PUBLIC_APP_URL: origin,
      AUTH_GOOGLE_ID: "", AUTH_GOOGLE_SECRET: "", AUTH_KAKAO_ID: "", AUTH_KAKAO_SECRET: "", BLOB_READ_WRITE_TOKEN: "", RESOURCE_PRIVATE_READ_WRITE_TOKEN: "",
      ACADEMIC_ENABLED: "false", ACADEMIC_ENROLLMENT_WRITES_ENABLED: "false", ACADEMIC_UPLOADS_ENABLED: "false", ACADEMIC_APPROVER_USER_ID: actor.manager.id,
      NODE_OPTIONS: `--import=${pathToFileURL(join(root, "tests/support/auth-measurement-preload.mjs")).href}` };
    stage = "BUILD";
    if (!options.reuseBuild || label === "baseline") {
      const build = launch([join(repository, "node_modules/next/dist/bin/next"), "build", "--webpack"], repository,
        { ...environment, NODE_OPTIONS: `--import=${pathToFileURL(join(root, "tests/support/resource-qa-preload.mjs")).href}` });
      // 빌드는 전체 실행보다 짧은 전용 기한을 두고 소유 그룹 종료를 보장합니다.
      let buildTimer;
      const buildDeadline = new Promise(resolveDeadline => { buildTimer = setTimeout(() => resolveDeadline(-2), 10 * 60_000); });
      const code = await Promise.race([children.get(build), buildDeadline,
        new Promise(resolveAbort => { if (controller.signal.aborted) resolveAbort(-1); else controller.signal.addEventListener("abort", () => resolveAbort(-1), { once: true }); })]);
      clearTimeout(buildTimer);
      await stop(build); check(code !== -2, "BUILD_TIMEOUT"); check(code === 0, "BUILD");
    }
    const versions = assertAuthMeasurementSources(repository);
    result.versions = { node: process.version, ...versions, postgres: command(join(process.env.HRA_TEST_PG_BIN, "postgres"), ["--version"]) };
    result.sourceSha = command("git", ["rev-parse", "HEAD"], repository);
    // HEAD와 다른 작업 파일이나 기존 빌드를 사용한 빠른 탐색 결과는 명시적으로 구분합니다.
    result.worktreeClean = command("git", ["status", "--porcelain", "--untracked-files=normal"], repository) === "";
    result.reusedBuild = Boolean(options.reuseBuild && label !== "baseline");
    result.lockHash = hash(readFileSync(join(repository, "package-lock.json")));
    stage = "SERVER";
    server = launch([join(repository, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], repository, environment);
    let ready = false; const startupDeadline = Date.now() + 90000;
    for (let attempt = 0; attempt < 180 && !ready && Date.now() < startupDeadline; attempt++) {
      controller.signal.throwIfAborted();
      try { ready = (await request(origin, "/api/auth/csrf", "", {}, 3000)).response.ok; } catch { /* 기동 중 연결 실패만 유한 횟수 재시도합니다. */ }
      if (!ready) await delay(250);
    }
    check(ready, "SERVER");
    /** 단일 측정 요청만 파일 문맥을 소유하고 응답 본문 소비 후 즉시 해제합니다. */
    async function measured(scenario, hint, action) {
      const sampleKey = ++key; context(sampleKey, hint); const start = performance.now();
      try { const value = await action(); samples.push({ sampleKey, scenario, durationMs: performance.now() - start }); return value; }
      finally { context(); }
    }
    /** CSRF 준비와 세션 검증은 측정 외부에서 수행하고 credentials POST만 관측합니다. */
    async function login(user, measuredLogin = false) {
      const jar = new Map(); const csrf = await request(origin, "/api/auth/csrf"); cookiesFrom(csrf.response, jar);
      const token = JSON.parse(csrf.body).csrfToken; check(typeof token === "string", "CSRF");
      const action = () => request(origin, "/api/auth/callback/credentials", cookieString(jar), { method: "POST", headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" }, body: new URLSearchParams({ csrfToken: token, email: user.email, password: siteRoutePassword, callbackUrl: origin }) });
      const logged = measuredLogin ? await measured("credentials", "LOGIN", action) : await action(); cookiesFrom(logged.response, jar);
      const cookie = cookieString(jar); const session = JSON.parse((await request(origin, "/api/auth/session", cookie)).body);
      check(session.user?.id === user.id && session.user?.role === user.role, "LOGIN"); return cookie;
    }
    stage = "MEASURE";
    const sessions = new Map();
    for (const user of [...new Map([...Object.values(actor), ...population, ...generated.map(user => byId.get(user.id))].map(user => [user.id, user])).values()]) sessions.set(user.id, await login(user));
    for (let index = 0; index < options.samples; index++) await login(actor.studentA, true);
    const cookie = user => sessions.get(user.id);
    const identity = async user => { const value = await request(origin, "/mypage", cookie(user)); check(value.response.status === 200 && value.body.includes(user.name) && !value.body.includes((user.id === actor.studentA.id ? actor.peerA : actor.studentA).name), "IDENTITY"); return value; };
    const normal = async (scenario, path, user, status, hint = "RSC") => measured(scenario, hint, async () => { const value = await request(origin, path, user ? cookie(user) : ""); check(value.response.status === status, `${scenario.toUpperCase()}_STATUS`); return value; });
    const manifest = JSON.parse(readFileSync(join(repository, ".next/server/server-reference-manifest.json"), "utf8"));
    const entry = Object.entries(manifest.node).find(([, value]) => value.filename?.endsWith("features/class-materials/actions/index.ts") && value.exportedName === "createClassMaterial" && Object.keys(value.workers).includes("app/(member)/resources/class-materials/page"));
    check(entry, "ACTION_MANIFEST");
    const require = createRequire(join(repository, "package.json"));
    const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node.js");
    const materialCount = cluster.sql("SELECT count(*) FROM class_materials;");
    for (let index = 0; index < options.samples; index++) {
      await normal("anonymous_public", "/curriculum", null, 200);
      await normal("anonymous_protected", "/mypage", null, 302);
      await normal("member_page", "/mypage", actor.studentA, 200);
      await normal("admin_page", "/admin/docs", actor.admin, 200);
      await normal("approver_page", "/admin/academics", actor.manager, 200);
      await normal("academic_gate", `/api/academic/submissions/${academicG1Ids.active}/file/${academicG1Ids.draft}`, actor.studentA, 404, "ROUTE");
      await measured("faculty_action", "ACTION", async () => {
        const value = await request(origin, "/resources/class-materials", cookie(actor.faculty), { method: "POST", headers: { Origin: origin, "Next-Action": entry[0] }, body: await encodeReply([new FormData()]) });
        check(value.response.status === 200 && /"success":false/.test(value.body), "ACTION_RESULT"); return value;
      });
    }
    check(cluster.sql("SELECT count(*) FROM class_materials;") === materialCount, "ACTION_WRITE");
    for (const count of [1,25,100,200].filter(count => count <= options.population)) {
      for (const user of population.slice(0, count)) await measured(`population_${count}`, "RSC", async () => {
        const value = await request(origin, "/mypage", cookie(user));
        if (user.role === "PENDING") check([302,307].includes(value.response.status) && new URL(value.response.headers.get("location"), origin).pathname === "/pending", "PENDING");
        else check(value.response.status === 200 && value.body.includes(user.name), "IDENTITY");
      });
    }
    stage = "REGRESSIONS";
    for (const user of [actor.studentA, actor.peerA, actor.studentA]) await identity(user);
    result.regressions.identitySequence = true;
    await Promise.all([identity(actor.studentA), identity(actor.peerA)]); result.regressions.concurrentIdentity = true;
    // 세션 API뿐 아니라 다음 보호 페이지 요청에서도 기존 쿠키가 즉시 거부되어야 합니다.
    const deniedSession = async user => {
      const protectedPage = await request(origin, "/mypage", cookie(user));
      check([302,307].includes(protectedPage.response.status) &&
        new URL(protectedPage.response.headers.get("location"), origin).pathname === "/login", "STALE_PROTECTED_PAGE");
      const session = JSON.parse((await request(origin, "/api/auth/session", cookie(user))).body);
      check(!session?.user?.id, "STALE_SESSION");
    };
    cluster.sql(`UPDATE users SET session_version=session_version+1 WHERE id='${actor.studentA.id}';`);
    await deniedSession(actor.studentA); sessions.set(actor.studentA.id, await login(actor.studentA)); result.regressions.sessionVersion = true;
    cluster.sql(`UPDATE users SET role='MEMBER' WHERE id='${actor.admin.id}';`);
    try { check((await request(origin, "/admin/docs", cookie(actor.admin))).response.status === 403, "ROLE_REVOKE"); }
    finally { cluster.sql(`UPDATE users SET role='ADMIN' WHERE id='${actor.admin.id}';`); }
    result.regressions.roleRevocation = true;
    const changed = byId.get(generated[0].id), deleted = byId.get(generated[1].id);
    cluster.sql(`UPDATE users SET role='PENDING' WHERE id='${changed.id}';`);
    const pending = await request(origin, "/mypage", cookie(changed));
    check([302,307].includes(pending.response.status) && new URL(pending.response.headers.get("location"), origin).pathname === "/pending", "PENDING_REVOKE"); result.regressions.pendingRevocation = true;
    cluster.sql(`DELETE FROM users WHERE id='${deleted.id}';`); await deniedSession(deleted); result.regressions.deletedUser = true;
    const failurePath = `/api/academic/submissions/${academicG1Ids.active}/file/${academicG1Ids.draft}`;
    // 정상 쿠키는 기능 게이트의 404까지 도달해야 하며 DB 장애 응답과 명확히 구분합니다.
    const beforeDatabaseFailure = await request(origin, failurePath, cookie(actor.studentA));
    check(beforeDatabaseFailure.response.status === 404, "DATABASE_PRECONDITION");
    cluster.sql("ALTER TABLE users RENAME TO auth_measure_users_unavailable;");
    try {
      const value = await request(origin, failurePath, cookie(actor.studentA));
      // 장애 중에도 404가 나오면 인증 생략일 수 있으므로 정확한 인증·가용성 오류만 인정합니다.
      const plainText = /^text\/plain(?:;|$)/i.test(value.response.headers.get("content-type") ?? "");
      check(plainText && (value.response.status === 401 && value.body === "로그인이 필요합니다." ||
        value.response.status === 503 && value.body === "파일을 제공할 수 없습니다. 잠시 후 다시 시도해 주세요."), "DATABASE_FAIL_CLOSED");
    } finally { cluster.sql("ALTER TABLE auth_measure_users_unavailable RENAME TO users;"); }
    result.regressions.databaseErrorFailClosed = true;
    stage = "AGGREGATE";
    const eventPath = join(cluster.root, "auth-measurement-events.jsonl");
    const events = existsSync(eventPath) ? readFileSync(eventPath, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
    result.scenarios = summarizeMeasurements(samples, events);
    for (const phase of ["PROXY", "RSC", "ACTION", "ROUTE", "LOGIN"]) check(events.some(event => event.phase === phase), "PHASE_MISSING");
    const publicMetric = result.scenarios.find(value => value.scenario === "anonymous_public");
    check(publicMetric.authCalls.total === options.samples && publicMetric.databaseRoundtrips.total === 0, "PUBLIC_COST");
    const gate = result.scenarios.find(value => value.scenario === "academic_gate"); check(gate.databaseRoundtrips.kinds.other === 0, "GATE_QUERY");
    result.complete = true;
  } finally {
    // 뒤쪽 회귀 실패도 앞서 완료한 비용 표본을 지우지 않도록 집계 증거를 보존합니다.
    if (cluster && !result.scenarios.length && samples.length) {
      try {
        const file = join(cluster.root, "auth-measurement-events.jsonl");
        const events = existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
        result.scenarios = summarizeMeasurements(samples, events.filter(event => samples.some(sample => sample.sampleKey === event.sampleKey)));
      } catch { diagnostics.add("AUTH_MEASURE_PARTIAL_AGGREGATE"); }
    }
    if (server) await stop(server);
    try { cluster?.close(); result.cleanupComplete = cleanupComplete; } catch { cleanupComplete = false; diagnostics.add("AUTH_MEASURE_DATABASE_CLEANUP"); }
  }
}

try {
  const options = { samples: 20, population: 200, reuseBuild: false }; const args = process.argv.slice(2); const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index]; check(!seen.has(flag), "ARGUMENTS"); seen.add(flag);
    if (["--single", "--compare", "--reuse-build"].includes(flag)) { options[flag.slice(2).replace("reuse-build", "reuseBuild")] = true; continue; }
    check(["--samples", "--population", "--output", "--baseline-ref"].includes(flag), "ARGUMENTS"); const value = args[++index]; check(value && !value.startsWith("--"), "ARGUMENTS");
    if (flag === "--output") output = resolve(value); else if (flag === "--baseline-ref") options.baseline = value; else options[flag.slice(2)] = Number(value);
  }
  check(Boolean(options.single) !== Boolean(options.compare) && Number.isInteger(options.samples) && options.samples >= 1 && options.samples <= 50 && Number.isInteger(options.population) && options.population >= 1 && options.population <= 200, "ARGUMENTS");
  check(process.env.HRA_TEST_PG_BIN, "PG_BIN_REQUIRED");
  if (options.compare) {
    check(/^[0-9a-f]{40}$/.test(options.baseline ?? ""), "BASELINE_REF");
    command("git", ["merge-base", "--is-ancestor", options.baseline, "HEAD"]);
    baselineParent = mkdtempSync(join(tmpdir(), "hra-auth-baseline-")); baselineRoot = join(baselineParent, "app");
    command("git", ["worktree", "add", "--detach", baselineRoot, options.baseline]); baselineAdded = true;
    check(readFileSync(join(baselineRoot, "package-lock.json")).equals(readFileSync(join(root, "package-lock.json"))), "LOCK_MISMATCH");
    symlinkSync(join(root, "node_modules"), join(baselineRoot, "node_modules"), "dir"); baselineLinked = true;
    await measure(baselineRoot, "baseline", options);
  } else check(!options.baseline, "ARGUMENTS");
  await measure(root, "current", options); complete = true; stage = "COMPLETE";
} catch (error) {
  diagnostics.add(/^AUTH_MEASURE_[A-Z_]+$/.test(error?.message) ? error.message : "AUTH_MEASURE_EXECUTION_FAILED"); process.exitCode = 1;
} finally {
  clearTimeout(timeout);
  for (const child of children.keys()) await stop(child);
  if (baselineParent) {
    try { if (baselineLinked) rmSync(join(baselineRoot, "node_modules"), { force: true }); }
    catch { cleanupComplete = false; diagnostics.add("AUTH_MEASURE_WORKTREE_CLEANUP"); }
    try { if (baselineAdded) command("git", ["worktree", "remove", "--force", baselineRoot]); }
    catch { cleanupComplete = false; diagnostics.add("AUTH_MEASURE_WORKTREE_CLEANUP"); }
    // 작업 트리 등록 전 실패한 경우에도 직접 만든 빈 부모 디렉터리는 회수합니다.
    try { if (!baselineAdded || !existsSync(baselineRoot)) rmSync(baselineParent, { recursive: true, force: true }); }
    catch { cleanupComplete = false; diagnostics.add("AUTH_MEASURE_WORKTREE_CLEANUP"); }
  }
  process.removeListener("SIGINT", interrupt); process.removeListener("SIGTERM", interrupt);
  if (!cleanupComplete) process.exitCode = 1;
  const report = { complete, cleanupComplete, stage, diagnostics: [...diagnostics].sort(),
    limits: { serialIdentityPopulations: true, maximumPopulation: 200, maximumSamples: 50, httpIncludesRenderingAndAdapter: true, databaseCountsLogicalNeonPosts: true, productionLatencyOrCapacityClaim: false }, runs };
  try { if (output) { mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + "\n", { mode: 0o600 }); } }
  catch { console.error("AUTH_MEASURE_REPORT_FAILED"); process.exitCode = 1; }
  console.log(JSON.stringify({ complete, cleanupComplete, stage, diagnostics: [...diagnostics].sort() }));
}
