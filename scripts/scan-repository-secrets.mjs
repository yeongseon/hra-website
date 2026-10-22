#!/usr/bin/env node
/** 현재 추적 파일과 fetched reachable Git 이력을 검사한다. scanner 출력/원문 보고서는 공개하지 않고 소유 임시 디렉터리만 제거한다. */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, lstatSync, readlinkSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join, dirname, isAbsolute } from 'node:path';
import { gitleaksVersion, gitleaksBinarySha256, summarizeSecretReport } from './_lib/secret-policy.mjs';
const environment = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, LANG: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
let temporary;
// 강제 종료를 제외한 사용자/CI 종료에서도 원문이 든 소유 임시 파일을 남기지 않는다.
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { if (temporary) rmSync(temporary, { recursive: true, force: true }); process.exit(1); });
try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--gitleaks' || !isAbsolute(args[1])) throw new Error('SECRET_ARGUMENTS_INVALID');
  const binary = args[1];
  if (createHash('sha256').update(readFileSync(binary)).digest('hex') !== gitleaksBinarySha256) throw new Error('SECRET_BINARY_MISMATCH');
  if (execFileSync(binary, ['version'], { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim() !== gitleaksVersion) throw new Error('SECRET_VERSION_MISMATCH');
  const git = (...params) => execFileSync('git', params, { env: environment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
  const root = git('rev-parse', '--show-toplevel').trim();
  if (git('rev-parse', '--is-shallow-repository').trim() !== 'false') throw new Error('SECRET_HISTORY_SHALLOW');
  git('rev-list', '--all', '--objects', '--missing=error');
  temporary = mkdtempSync(join(tmpdir(), 'hra-secret-scan-'));
  const source = join(temporary, 'source'); mkdirSync(source);
  const ignore = join(temporary, '.gitleaksignore'); writeFileSync(ignore, '', { mode: 0o600 });
  const config = join(temporary, 'policy.toml'); writeFileSync(config, '[extend]\nuseDefault = true\n', { mode: 0o600 });
  const files = git('ls-files', '-z').split('\0').filter(Boolean);
  if (!files.length) throw new Error('SECRET_SOURCE_EMPTY');
  for (const file of files) {
    const destination = resolve(source, file);
    if (!destination.startsWith(source + '/')) throw new Error('SECRET_PATH_INVALID');
    const original = join(root, file); const stat = lstatSync(original);
    if (!stat.isFile() && !stat.isSymbolicLink()) throw new Error('SECRET_SOURCE_INVALID');
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, stat.isSymbolicLink() ? readlinkSync(original) : readFileSync(original), { mode: 0o600 });
  }
  // 같은 fixture 경로의 새 secret과 삭제된 commit의 secret을 실제 엔진으로 반드시 탐지한다.
  const canary = join(temporary, 'canary'); mkdirSync(canary);
  const canaryFile = 'tests/unit/academic-upload-server.test.ts';
  mkdirSync(dirname(join(canary, canaryFile)), { recursive: true });
  const fixtureText = readFileSync(join(root, canaryFile), 'utf8');
  const fixture = [...fixtureText.matchAll(/["']([^"'\n]+)["']/g)].map(match => match[1]).find(value => value.startsWith('vercel_blob_rw_') && value.includes('fixture'));
  if (!fixture || !summarizeSecretReport([{ RuleID: 'generic-api-key', File: canaryFile, Secret: fixture }]).syntheticFixtures) throw new Error('SECRET_FIXTURE_CHANGED');
  writeFileSync(join(canary, canaryFile), `const fixture_token = "${fixture}";\nconst api_key = "${randomBytes(32).toString('hex')}";\n`);
  const canaryGit = (...params) => execFileSync('git', ['-c', 'core.hooksPath=/dev/null', '-c', 'user.name=HRA synthetic canary', '-c', 'user.email=canary@example.invalid', ...params], { cwd: canary, env: environment, stdio: ['ignore', 'pipe', 'pipe'] });
  canaryGit('init', '--quiet'); canaryGit('add', '.'); canaryGit('commit', '--quiet', '-m', 'Synthetic detection canary');
  for (const scope of ['source', 'history']) {
    if (scope === 'history') { writeFileSync(join(canary, canaryFile), '// 합성 secret을 현재 소스에서 제거했다.\n'); canaryGit('add', '.'); canaryGit('commit', '--quiet', '-m', 'Remove synthetic canary'); }
    const report = join(temporary, 'canary-' + scope + '.json');
    const command = scope === 'source' ? ['dir', '.'] : ['git', '.', '--log-opts=--all --full-history'];
    const run = spawnSync(binary, [...command, '--config', config, '--report-format', 'json', '--report-path', report, '--exit-code', '19', '--ignore-gitleaks-allow', '--gitleaks-ignore-path', ignore, '--no-banner', '--no-color'], { cwd: canary, env: environment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 });
    if (run.error || run.status !== 19) throw new Error('SECRET_CANARY_FAILED');
    const result = summarizeSecretReport(JSON.parse(readFileSync(report, 'utf8')));
    if (result.findings !== 1 || result.syntheticFixtures !== 1) throw new Error('SECRET_CANARY_FAILED');
  }
  const reports = [];
  for (const scope of ['source', 'history']) {
    const report = join(temporary, scope + '.json');
    const command = scope === 'source' ? ['dir', '.'] : ['git', root, '--log-opts=--all --full-history'];
    const run = spawnSync(binary, [...command, '--config', config, '--report-format', 'json', '--report-path', report, '--exit-code', '19', '--ignore-gitleaks-allow', '--gitleaks-ignore-path', ignore, '--no-banner', '--no-color'], { cwd: scope === 'source' ? source : root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 240000, maxBuffer: 16 * 1024 * 1024 });
    if (run.error || ![0, 19].includes(run.status)) throw new Error('SECRET_SCANNER_FAILED');
    const result = summarizeSecretReport(JSON.parse(readFileSync(report, 'utf8')));
    if ((run.status === 0) !== (result.findings + result.syntheticFixtures === 0)) throw new Error('SECRET_REPORT_INCONSISTENT');
    reports.push({ scope, ...result });
  }
  console.log(JSON.stringify({ scanner: gitleaksVersion, canary: { source: true, history: true }, reports }));
  if (reports.some(result => result.findings)) process.exitCode = 1;
} catch (error) {
  const code = error instanceof Error && /^SECRET_[A-Z_]+$/.test(error.message) ? error.message : 'SECRET_SCAN_FAILED';
  console.error(code); process.exitCode = 1;
} finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
