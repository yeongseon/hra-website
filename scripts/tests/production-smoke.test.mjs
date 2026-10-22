/** 공개 스모크 검사의 격리 HTTP 계약과 비밀 정보 비노출을 검증한다. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { runProductionSmoke, renderProductionSmokeSummary } from '../verify-production-smoke.mjs';

const sha = 'a'.repeat(40);
const secret = 'SYNTHETIC_SECRET_DO_NOT_REPORT';

// 요청 원문과 동시 요청 수는 시험 서버 안에만 기록한다.
async function fixture(t, overrides = {}) {
  const requests = [];
  let active = 0;
  let peak = 0;
  const server = createServer(async (req, res) => {
    requests.push({ method: req.method, headers: req.headers, path: req.url });
    active += 1;
    peak = Math.max(active, peak);
    res.on('close', () => { active -= 1; });
    if (overrides[req.url]) return overrides[req.url](req, res);
    await new Promise((done) => setTimeout(done, 5));
    if (req.url === '/favicon.ico') {
      res.writeHead(200, { 'content-type': 'image/x-icon' });
      res.end(Buffer.from([0, 0, 1, 0, 1, 0]));
    } else if (req.url === '/api/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"status":"ok"}');
    } else {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<html lang="ko"><title>HRA</title></html>');
    }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`, requests, peak: () => peak,
    run: (extra = {}) => runProductionSmoke({ origin: `http://127.0.0.1:${server.address().port}`, sha, shaKind: 'fixture', fixture: true, ...extra }),
  };
}

// 정상 계약과 인증 정보가 없는 읽기 전용 요청을 함께 확인한다.
test('네 공개 경로가 성공하고 두 요청 이하로 실행된다', async (t) => {
  const app = await fixture(t);
  const report = await app.run();
  assert.equal(report.ok, true);
  assert.equal(report.environment, 'fixture');
  assert.equal(report.checks.length, 4);
  assert.ok(app.peak() <= 2);
  assert.equal(app.peak(), 2);
  for (const request of app.requests) {
    assert.equal(request.method, 'GET');
    assert.equal(request.headers.cookie, undefined);
    assert.equal(request.headers.authorization, undefined);
    assert.equal(request.headers['x-health-secret'], undefined);
    assert.equal(request.headers['x-health-check-secret'], undefined);
  }
});

for (const [name, path, status, type, body, code] of [
  ['상태 실패', '/api/health', 503, 'application/json', secret, 'HTTP_STATUS'],
  ['진단 필드 누출', '/api/health', 200, 'application/json', JSON.stringify({ status: 'ok', detail: secret }), 'HEALTH_CONTENT'],
  ['잘못된 상태', '/api/health', 200, 'application/json', '{"status":"error"}', 'HEALTH_CONTENT'],
  ['HTML 언어 오류', '/', 200, 'text/html', '<html lang="en">HRA</html>', 'CONTENT'],
  ['HTML 브랜드 오류', '/login', 200, 'text/html', '<html lang="ko">다른 서비스</html>', 'CONTENT'],
  ['HTML 유형 오류', '/', 200, 'text/plain', '<html lang="ko">HRA</html>', 'CONTENT_TYPE'],
  ['아이콘 서명 오류', '/favicon.ico', 200, 'image/x-icon', secret, 'CONTENT'],
  ['아이콘 유형 오류', '/favicon.ico', 200, 'text/html', secret, 'CONTENT_TYPE'],
  ['건강 유형 오류', '/api/health', 200, 'text/plain', '{"status":"ok"}', 'CONTENT_TYPE'],
  ['본문 제한', '/', 200, 'text/html', secret.repeat(100000), 'BODY_LIMIT'],
]) {
  test(name, async (t) => {
    const app = await fixture(t, { [path]: (_req, res) => { res.writeHead(status, { 'content-type': type }); res.end(body); } });
    const report = await app.run();
    assert.equal(report.ok, false);
    assert.equal(report.checks.find((check) => check.path === path).code, code);
    assert.ok(!JSON.stringify(report).includes(secret));
    assert.ok(!renderProductionSmokeSummary(report).includes(secret));
  });
}

test('리디렉션을 따라가지 않는다', async (t) => {
  let hits = 0;
  const canary = await fixture(t, { '/': (_req, res) => { hits += 1; res.end(secret); } });
  const app = await fixture(t, { '/': (_req, res) => { res.writeHead(302, { location: canary.origin }); res.end(); } });
  const report = await app.run();
  assert.equal(report.checks[0].code, 'HTTP_STATUS');
  assert.equal(hits, 0);
});

test('시간 제한은 본문 수신에도 적용된다', async (t) => {
  const app = await fixture(t, { '/': (_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.write('<html'); } });
  const report = await app.run({ timeoutMs: 50 });
  assert.equal(report.checks[0].code, 'TIMEOUT');
});

test('잘못된 출처와 SHA를 네트워크 요청 전에 거부한다', async () => {
  for (const origin of ['https://example.com', 'https://hra-website-theta.vercel.app/', 'https://hra-website-theta.vercel.app?x=1', 'https://user@hra-website-theta.vercel.app', 'https://hra-website-theta.vercel.app/#x']) {
    await assert.rejects(runProductionSmoke({ origin, sha }), /INVALID_ORIGIN/);
  }
  for (const origin of ['http://localhost:3000', 'http://192.168.1.1', 'http://127.0.0.1:3000/path', 'http://127.0.0.1:3000?x=1']) {
    await assert.rejects(runProductionSmoke({ origin, sha, fixture: true }), /INVALID_ORIGIN/);
  }
  await assert.rejects(runProductionSmoke({ sha: 'main' }), /INVALID_SHA/);
  await assert.rejects(runProductionSmoke({ sha, shaKind: 'fixture' }), /INVALID_SHA_KIND/);
  await assert.rejects(runProductionSmoke({ sha, timeoutMs: 10 }), /INVALID_TIMEOUT/);
});

test('실패 CLI는 정제된 JSON과 운영 요약을 기록하고 종료 코드 1을 반환한다', async (t) => {
  const app = await fixture(t, { '/api/health': (_req, res) => { res.writeHead(503); res.end(secret); } });
  const directory = await mkdtemp(join(tmpdir(), 'hra-smoke-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = join(directory, 'result', 'report.json');
  const summary = join(directory, 'summary.md');
  const child = spawn(process.execPath, ['scripts/verify-production-smoke.mjs', '--sha', sha, '--sha-kind', 'fixture', '--fixture', '--fixture-origin', app.origin, '--output', output], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_STEP_SUMMARY: summary }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (data) => { stdout += data; });
  child.stderr.on('data', (data) => { stderr += data; });
  const exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done); });
  assert.equal(exitCode, 1);
  const json = await readFile(output, 'utf8');
  const markdown = await readFile(summary, 'utf8');
  assert.equal(JSON.parse(json).ok, false);
  assert.deepEqual(JSON.parse(stdout), JSON.parse(json));
  assert.match(markdown, /HTTP_STATUS/);
  assert.match(markdown, /docs\/operations\/production-smoke\.md/);
  assert.match(markdown, /실제 서비스 중인 배포 버전의 증거가 아닙니다/);
  for (const text of [json, markdown, stdout, stderr]) assert.ok(!text.includes(secret));
});
