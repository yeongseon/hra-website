/**
 * 인증 관측의 소스 계약·Request 호환성·단계 분류를 실제 설치본과 합성 값으로 검증합니다.
 * 쿠키·SQL·매개변수 원문은 출력하지 않습니다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runInNewContext } from "node:vm";
import {
  assertAuthMeasurementSources, authMeasurementPhase, authMeasurementStack, classifyAuthDatabaseQuery, installAuthRequestObserver,
} from "../../tests/support/auth-measurement-core.mjs";

const repository = resolve(import.meta.dirname, "../..");
const origin = "http://127.0.0.1:43210";

// 실제 설치본은 검증하되 빌드 산출물이 없는 일반 단위 검사에서도 합성 빌드를 사용할 수 있습니다.
const sourceFiles = [
  "node_modules/next/package.json", "node_modules/next-auth/package.json", "node_modules/next-auth/lib/index.js",
  "node_modules/next/dist/server/app-render/async-local-storage.js",
  "node_modules/next/dist/server/app-render/work-unit-async-storage-instance.js",
];
function sourceFixture(run) {
  const root = mkdtempSync(join(tmpdir(), "hra-auth-source-"));
  try {
    for (const path of sourceFiles) {
      mkdirSync(dirname(join(root, path)), { recursive: true });
      writeFileSync(join(root, path), readFileSync(join(repository, path)));
    }
    mkdirSync(join(root, ".next/server"), { recursive: true });
    writeFileSync(join(root, ".next/server/middleware.js"),
      'function a(b,c){return Auth(new Request(action("session",b.get("x-forwarded-proto"),b,settings,c),{headers:{cookie:b.get("cookie")??""}}),c)}');
    run(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("설치된 인증·저장소 소스와 압축 빌드 관측 계약을 검증한다", () => {
  sourceFixture((root) => {
    const versions = assertAuthMeasurementSources(root);
    assert.equal(versions.nextVersion, JSON.parse(readFileSync(join(repository, sourceFiles[0]), "utf8")).version);
    assert.equal(versions.authVersion, JSON.parse(readFileSync(join(repository, sourceFiles[1]), "utf8")).version);
  });
});

for (const [label, path, before, after] of [
  ["쿠키 입력 변경", sourceFiles[2], 'headers: { cookie: headers.get("cookie") ?? "" }', 'headers: { authorization: headers.get("cookie") ?? "" }'],
  ["저장소 이름 변경", sourceFiles[4], "'work-unit-async-storage'", "'different-storage'"],
  ["저장소 버전 변경", sourceFiles[3], '@next/${name}@', '@other/${name}@'],
  ["빌드 입력 변경", ".next/server/middleware.js", 'cookie:b.get("cookie")', 'authorization:b.get("cookie")'],
]) {
  test(`계약 변경을 거부한다: ${label}`, () => {
    sourceFixture((root) => {
      const file = join(root, path);
      const original = readFileSync(file, "utf8");
      assert.ok(original.includes(before));
      writeFileSync(file, original.replace(before, after));
      assert.throws(() => assertAuthMeasurementSources(root), /^Error: AUTH_MEASUREMENT_SOURCE_MISMATCH$/);
    });
  });
}

test("실제 인증 Request와 익명 인증만 세며 기본 생성자·복제를 보존한다", () => {
  const events = [];
  const NativeRequest = globalThis.Request;
  const restore = installAuthRequestObserver({ origin, onAuth: (event) => events.push(event) });
  try {
    const request = new Request(`${origin}/api/auth/session`, { headers: { cookie: "secret-session-value" } });
    assert.ok(request instanceof NativeRequest);
    assert.ok(request instanceof Request);
    assert.equal(request.method, "GET");
    assert.equal(request.headers.get("cookie"), "secret-session-value");
    const clone = request.clone();
    assert.ok(clone instanceof NativeRequest);
    assert.equal(clone.headers.get("cookie"), "secret-session-value");
    new Request(new URL(`${origin}/api/auth/session`), { headers: { cookie: "" } });
    class CustomRequest extends Request {}
    assert.ok(new CustomRequest(`${origin}/other`) instanceof CustomRequest);
    assert.equal(events.length, 2);
    assert.deepEqual(events.map(Object.keys), [["stack"], ["stack"]]);
    assert.ok(!JSON.stringify(events).includes("secret-session-value"));
  } finally { restore(); }
  assert.equal(globalThis.Request, NativeRequest);
});

test("등록·일반 HTTP 세션 요청·다른 원점·추가 옵션은 인증 호출로 세지 않는다", () => {
  let count = 0;
  const restore = installAuthRequestObserver({ origin, onAuth: () => count++ });
  try {
    const register = (callback) => callback;
    register(() => null);
    new Request(`${origin}/api/auth/session`);
    new Request(`${origin}/api/auth/session`, { headers: new Headers({ cookie: "" }) });
    new Request(`${origin}/api/auth/session`, { headers: { cookie: "" }, method: "GET" });
    new Request(`${origin}/api/auth/session`, { headers: { cookie: "", extra: "" } });
    new Request(`${origin}/api/auth/session?extra=1`, { headers: { cookie: "" } });
    new Request("http://127.0.0.1:43211/api/auth/session", { headers: { cookie: "" } });
    new Request(`${origin}/other`, { headers: { cookie: "" } });
    new Request(new Request(`${origin}/api/auth/session`), { headers: { cookie: "" } });
    assert.equal(count, 0);
  } finally { restore(); }
});

test("프록시·로그인·라우트와 기존 전역 저장소의 action/render 단계를 구별한다", () => {
  const nextVersion = "test-version";
  const key = Symbol.for(`@next/work-unit-async-storage@${nextVersion}`);
  const previous = globalThis[key];
  let phase;
  globalThis[key] = { getStore: () => ({ phase }) };
  const measure = (hint, stack) => authMeasurementPhase({ hint, stack, nextVersion });
  try {
    phase = "action";
    assert.equal(measure("RSC"), "ACTION");
    phase = "render";
    assert.equal(measure("ACTION"), "RSC");
    assert.equal(measure("LOGIN"), "LOGIN");
    assert.equal(measure("ROUTE"), "ROUTE");
    assert.equal(measure("LOGIN", "at run (/tmp/server/middleware.js:1:4)"), "PROXY");
    assert.equal(measure("ROUTE", "at run (/tmp/server/proxy.js:1:4)"), "PROXY");
    phase = "after";
    assert.equal(measure("RSC"), "UNKNOWN");
    delete globalThis[key];
    assert.equal(measure("ACTION"), "UNKNOWN");
  } finally {
    if (previous === undefined) delete globalThis[key];
    else globalThis[key] = previous;
  }
});

test("DB 분류는 고정 종류만 반환하고 SQL·파라미터를 노출하지 않는다", () => {
  const cases = [
    ['select "session_version" from users where id = $1', "session"],
    ['select "password_hash", "session_version" from users', "credentials"],
    ["select * from reserve_rate_limit($1, $2, $3, $4)", "rate_limit"],
    ['delete from "rate_limit_events" where reservation_id = $1', "rate_limit"],
    ["select 1", "other"],
  ];
  const captured = cases.map(([query, kind]) => {
    const dbKind = classifyAuthDatabaseQuery({ query, params: ["private-sql-parameter"] });
    assert.equal(dbKind, kind);
    return { sampleKey: 1, type: "db", phase: "LOGIN", durationMs: 0, failed: false, dbKind };
  });
  assert.ok(!JSON.stringify(captured).includes("private-sql-parameter"));
  assert.ok(!JSON.stringify(captured).includes("select"));
  assert.equal(classifyAuthDatabaseQuery(undefined), "other");
});

/** preload의 격리 의존성만 대체하고 실제 이벤트 생성·직렬화 코드는 그대로 실행합니다. */
function preloadFixture(workingDirectory = "/synthetic-target-build") {
  let sample = { sampleKey: 1, hint: "LOGIN" };
  let authObserver;
  const events = [];
  const errors = [];
  const calls = [];
  const guardedRepositories = [];
  let respond = async () => ({ ok: true });
  const context = {
    join,
    assertAuthMeasurementSources: (target) => { guardedRepositories.push(target); return { nextVersion: "test-version" }; },
    authMeasurementPhase, authMeasurementStack, classifyAuthDatabaseQuery,
    installAuthRequestObserver: ({ onAuth }) => { authObserver = onAuth; },
    process: { cwd: () => workingDirectory, env: { HRA_RESOURCE_QA_ROOT: "/synthetic-qa", HRA_SITE_ROUTE_ORIGIN: origin } },
    readFileSync: () => JSON.stringify(sample),
    appendFileSync: (_path, line) => { events.push(JSON.parse(line)); },
    qaNeonEndpoint: "https://api.resource-qa.invalid/sql", Request, URL, performance,
    console: { error: (message) => errors.push(message) },
    fetch: async (...args) => { calls.push(args); return respond(); },
  };
  const source = readFileSync(join(repository, "tests/support/auth-measurement-preload.mjs"), "utf8");
  // 실제 preload는 정적 import로 격리를 먼저 설치합니다. 여기서는 그 다음 실행부만 검증합니다.
  const executable = source.slice(source.indexOf("const repository ="));
  runInNewContext(executable, context);
  return {
    events, errors, calls, guardedRepositories,
    auth: (stack = "") => authObserver({ stack }),
    fetch: (...args) => context.fetch(...args),
    setSample: (value) => { sample = value; },
    setResponse: (value) => { respond = value; },
  };
}

test("preload는 HTTP 전송 한 번을 세고 시작 문맥을 보존하며 비밀을 기록하지 않는다", async () => {
  const fixture = preloadFixture();
  let complete;
  fixture.setResponse(() => new Promise((resolve) => { complete = resolve; }));
  const pending = fixture.fetch("https://api.resource-qa.invalid/sql", {
    method: "POST", body: JSON.stringify({ query: 'select "password_hash" from users where email = $1', params: ["secret-email"] }),
  });
  fixture.setSample({ sampleKey: 2, hint: "ROUTE" });
  complete({ ok: true });
  await pending;
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.events.length, 1);
  assert.equal(fixture.events[0].sampleKey, 1);
  assert.equal(fixture.events[0].phase, "LOGIN");
  assert.equal(fixture.events[0].dbKind, "credentials");
  assert.equal(fixture.events[0].failed, false);
  assert.ok(fixture.events[0].durationMs >= 0);
  assert.deepEqual(Object.keys(fixture.events[0]).sort(), ["dbKind", "durationMs", "failed", "phase", "sampleKey", "type"]);
  assert.ok(!JSON.stringify(fixture.events).includes("secret-email"));
  assert.ok(!JSON.stringify(fixture.events).includes("password_hash"));
  fixture.auth("at run (/server/middleware.js:1:3)");
  assert.equal(fixture.events[1].phase, "PROXY");
  fixture.setSample({ sampleKey: 0, hint: "RSC" });
  fixture.auth();
  assert.equal(fixture.events.length, 2);
});

test("preload는 실패와 UNKNOWN을 기록하고 문맥 오류 원문은 숨긴다", async () => {
  const fixture = preloadFixture();
  fixture.setSample({ sampleKey: 3, hint: "RSC" });
  fixture.auth();
  assert.equal(fixture.events[0].phase, "UNKNOWN");
  fixture.setResponse(async () => { throw new Error("synthetic-private-error"); });
  await assert.rejects(fixture.fetch("https://api.resource-qa.invalid/sql", {
    method: "POST", body: '{"query":"select session_version from users"}',
  }));
  assert.equal(fixture.events[1].failed, true);
  assert.ok(!JSON.stringify(fixture.events).includes("synthetic-private-error"));
  fixture.setSample({ sampleKey: 4, hint: "invalid-private-value" });
  assert.throws(() => fixture.auth(), /^Error: AUTH_MEASUREMENT_FAILED$/);
  assert.ok(fixture.errors.every((message) => message === "AUTH_MEASUREMENT_FAILED"));
});


test("깊은 스택을 일시 수집하고 전역 스택 한도를 즉시 복구한다", () => {
  const previous = Error.stackTraceLimit;
  Error.stackTraceLimit = 5;
  try {
    const recurse = (depth) => depth ? recurse(depth - 1) : authMeasurementStack();
    const stack = recurse(30);
    assert.ok(stack.split("\n").length > 30);
    assert.equal(Error.stackTraceLimit, 5);
  } finally { Error.stackTraceLimit = previous; }
});


test("preload 위치와 측정 대상 cwd가 다르면 대상의 소스·빌드만 검증한다", () => {
  // 현재 저장소에서 preload를 읽어도 과거 커밋의 별도 worktree에서 실행될 수 있습니다.
  // 이때 현재 저장소의 .next 유무에 의존하지 않고 실제 실행 cwd를 검사해야 합니다.
  const baselineDirectory = "/synthetic-baseline-worktree";
  assert.notEqual(baselineDirectory, repository);
  const baseline = preloadFixture(baselineDirectory);
  assert.deepEqual(baseline.guardedRepositories, [baselineDirectory]);
  const currentDirectory = "/synthetic-current-worktree";
  const current = preloadFixture(currentDirectory);
  assert.deepEqual(current.guardedRepositories, [currentDirectory]);
});
