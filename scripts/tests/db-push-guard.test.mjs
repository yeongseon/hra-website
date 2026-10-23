/**
 * 기본 push의 접속 차단과 오프라인 Kit 호환성을 실제 실행기로 확인한다.
 * 운영 환경 대신 합성 URL·임시 파일·외부 연결 차단 관찰자만 사용한다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, writeFile, readFile, readdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const kit = path.join(repository, "node_modules/drizzle-kit/bin.cjs");
// 자식 실행기에 앱 자격정보를 상속하지 않는다. DATABASE_URL은 매 사례의 합성 값이다.
const basic = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP, SYSTEMROOT: process.env.SYSTEMROOT };

/** TCP·HTTP 계열 연결을 세고 차단하되 Kit tsx의 로컬 Unix IPC는 유지한다. */
async function sandbox(t, url) {
  const root = await mkdtemp(path.join(tmpdir(), "hra-push-guard-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await symlink(path.join(repository, "node_modules"), path.join(root, "node_modules"), "dir");
  await symlink(path.join(repository, "src"), path.join(root, "src"), "dir");
  await writeFile(path.join(root, "tsconfig.json"), await readFile(path.join(repository, "tsconfig.json")));
  await writeFile(path.join(root, "drizzle.config.ts"), await readFile(path.join(repository, "drizzle.config.ts")));
  // 실제 환경 파일은 열지 않으며, dotenv 회귀를 탐지할 합성 파일만 직접 만든다.
  await writeFile(path.join(root, ".env"), `DATABASE_URL=${url}\n`, { mode: 0o600 });
  const audit = path.join(root, "network-attempts");
  const preload = path.join(root, "deny-network.mjs");
  await writeFile(preload, `
import fs from "node:fs";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import path from "node:path";
import os from "node:os";
import { syncBuiltinESMExports } from "node:module";
const deny = (kind) => {
  fs.appendFileSync(${JSON.stringify(audit)}, kind + "\\n");
  throw new Error("PUSH_TEST_NETWORK_DENIED");
};
// 설치 Kit의 tsx는 부모 PID를 이름으로 쓰는 이 IPC 한 경로에만 연결한다.
const pipe = path.join(os.tmpdir(), "tsx-" + (process.geteuid ? process.geteuid() : os.userInfo().username), process.ppid + ".pipe");
const expectedIpc = process.platform === "win32" ? String.fromCharCode(92,92,63,92,112,105,112,101,92) + pipe : pipe;
const ipcOrDeny = (original) => (...args) => {
  const first = args[0];
  const socketPath = typeof first === "string" ? first : first?.path;
  if (socketPath === expectedIpc) return original.apply(net, args);
  return deny(socketPath ? "unix" : "tcp");
};
net.connect = ipcOrDeny(net.connect);
net.createConnection = ipcOrDeny(net.createConnection);
tls.connect = () => deny("tls");
http.request = () => deny("http");
http.get = () => deny("http-get");
https.request = () => deny("https");
https.get = () => deny("https-get");
dns.lookup = () => deny("dns");
dns.resolve = () => deny("dns-resolve");
globalThis.fetch = () => deny("fetch");
globalThis.WebSocket = class { constructor() { deny("websocket"); } };
syncBuiltinESMExports();
`);
  const run = (args) => spawnSync(process.execPath, args, { cwd: root, env: { ...basic, DATABASE_URL: url, NODE_OPTIONS: `--import=${preload}` }, encoding: "utf8", timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  return { root, run, async attempts() { try { return (await readFile(audit, "utf8")).trim().split("\n").length; } catch (error) { if (error.code === "ENOENT") return 0; throw error; } } };
}

test("npm push 진입점은 인자·환경을 적용 권한으로 취급하지 않는다", async (t) => {
  const fixture = await sandbox(t, "postgresql://synthetic:never-output@127.0.0.1:1/existing");
  const packageJson = JSON.parse(await readFile(path.join(repository, "package.json"), "utf8"));
  assert.equal(packageJson.scripts["db:push"], "node scripts/db-push.mjs");
  for (const args of [[], ["--isolated"], ["--url", "synthetic-private-sentinel"], ["--apply"], ["--approval", "forged.json"]]) {
    const result = fixture.run([path.join(repository, "scripts/db-push.mjs"), ...args]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /비활성화.*접속하지 않았습니다/);
    assert.doesNotMatch(result.stdout + result.stderr, /never-output|synthetic-private-sentinel|forged\.json/);
  }
  assert.equal(await fixture.attempts(), 0);
});

test("Kit 기본 push·migrate는 환경과 합성 .env의 URL을 읽어 연결하지 않는다", async (t) => {
  const fixture = await sandbox(t, "postgresql://synthetic:never-output@127.0.0.1:1/existing");
  for (const command of ["push", "migrate"]) {
    const result = fixture.run([kit, command]);
    assert.equal(result.status, 1);
    assert.match(result.stdout + result.stderr, /connection.*required/i);
    assert.doesNotMatch(result.stdout + result.stderr, /never-output|dotenv|PUSH_TEST_NETWORK_DENIED/);
  }
  assert.equal(await fixture.attempts(), 0);
});

test("실제 Kit export·generate는 접속 없이 임시 폴더에 정상 산출물을 만든다", async (t) => {
  const fixture = await sandbox(t, "postgresql://synthetic:never-output@127.0.0.1:1/existing");
  const exported = fixture.run([kit, "export"]);
  assert.equal(exported.status, 0);
  assert.match(exported.stdout, /CREATE TABLE "users"/);
  const generated = fixture.run([kit, "generate", "--name", "isolated-guard-check"]);
  assert.equal(generated.status, 0);
  const files = await readdir(path.join(fixture.root, "drizzle"));
  assert.equal(files.some(file => file.endsWith(".sql")), true);
  assert.equal(await fixture.attempts(), 0);
});


test("외부 연결 관찰자는 TCP·임의 Unix socket·fetch 호출을 차단하고 기록한다", async (t) => {
  const fixture = await sandbox(t, "postgresql://synthetic:never-output@127.0.0.1:1/existing");
  const result = fixture.run(["--input-type=module", "-e", `import net from 'node:net';const seen=[];try{net.createConnection({host:'127.0.0.1',port:1})}catch(error){seen.push(error.message)}try{net.createConnection({path:'/tmp/not-kit-db-socket'})}catch(error){seen.push(error.message)}try{fetch('https://network-canary.invalid/')}catch(error){seen.push(error.message)}if(seen.length!==3||seen.some(value=>value!=='PUSH_TEST_NETWORK_DENIED'))process.exitCode=1;`]);
  assert.equal(result.status, 0);
  assert.equal(await fixture.attempts(), 3);
});
