#!/usr/bin/env node
/** 공개 npm registry만 사용해 lock 기반 audit를 실행한다. 통신 오류나 원문 오류/응답을 CI 로그에 출력하지 않는다. */
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dependencyDiagnosticLines, verifyDependencyPolicy } from './_lib/dependency-policy.mjs';
let temporary;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { if (temporary) rmSync(temporary, { recursive: true, force: true }); process.exit(1); });
try {
  if (process.argv.length !== 2) throw new Error('DEPENDENCY_ARGUMENTS_INVALID');
  temporary = mkdtempSync(join(tmpdir(), 'hra-dependency-audit-'));
  for (const name of ['package.json', 'package-lock.json']) writeFileSync(join(temporary, name), readFileSync(new URL('../' + name, import.meta.url)), { mode: 0o600 });
  writeFileSync(join(temporary, 'user.npmrc'), ''); writeFileSync(join(temporary, 'global.npmrc'), '');
  const environment = { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, SystemRoot: process.env.SYSTEMROOT, LANG: 'C', npm_config_userconfig: join(temporary, 'user.npmrc'), npm_config_globalconfig: join(temporary, 'global.npmrc'), npm_config_cache: join(temporary, 'cache') };
  const run = spawnSync('npm', ['audit', '--json', '--package-lock-only', '--ignore-scripts', '--registry=https://registry.npmjs.org', '--fetch-retries=0', '--fetch-timeout=30000'], { cwd: temporary, env: environment, stdio: ['ignore', 'pipe', 'pipe'], timeout: 60000, maxBuffer: 16 * 1024 * 1024 });
  if (run.error || ![0, 1].includes(run.status)) throw new Error('DEPENDENCY_AUDIT_FAILED');
  const audit = JSON.parse(run.stdout.toString('utf8'));
  if (audit.error) throw new Error('DEPENDENCY_AUDIT_FAILED');
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const policy = JSON.parse(readFileSync(new URL('../security/dependency-triage.json', import.meta.url), 'utf8'));
  console.log(JSON.stringify(verifyDependencyPolicy(audit, lock, policy)));
} catch (error) {
  for (const line of dependencyDiagnosticLines(error)) console.error(line);
  process.exitCode = 1;
}

finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
