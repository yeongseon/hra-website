/** fixture 단위 예외가 같은 파일의 다른 secret과 다른 규칙/경로까지 숨기지 않는지 검증한다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarizeSecretReport, isVerifiedSyntheticFinding } from '../_lib/secret-policy.mjs';
const source = readFileSync(new URL('../../tests/unit/academic-upload-server.test.ts', import.meta.url), 'utf8');
const fixture = [...source.matchAll(/["']([^"'\n]+)["']/g)].map(match => match[1]).find(value => value.startsWith('vercel_blob_rw_') && value.includes('fixture'));
const finding = { RuleID: 'generic-api-key', File: 'tests/unit/academic-upload-server.test.ts', Secret: fixture };
// 실제 SDK의 서명을 로컬에서 만드는 v1 테스트도 값·파일·규칙이 모두 일치할 때만 합성으로 판정합니다.
const apiSource = readFileSync(new URL('../../tests/unit/api-v1-academic-uploads-route.test.ts', import.meta.url), 'utf8');
const apiFixture = [...apiSource.matchAll(/["']([^"'\n]+)["']/g)].map(match => match[1]).find(value => value.startsWith('vercel_blob_rw_') && value.includes('fixture'));
const apiFinding = { RuleID: 'generic-api-key', File: 'tests/unit/api-v1-academic-uploads-route.test.ts', Secret: apiFixture };
test('v1 SDK 서명 테스트의 정확한 합성 값만 제외한다', () => {
  assert.ok(apiSource.includes('vi.mock("@vercel/blob"'));
  assert.ok(apiSource.includes('vi.stubEnv("ACADEMIC_SUBMISSION_READ_WRITE_TOKEN", token)'));
  assert.ok(apiSource.includes('createHmac'));
  assert.ok(apiFixture);
  assert.equal(isVerifiedSyntheticFinding(apiFinding), true);
  assert.deepEqual(summarizeSecretReport([finding, apiFinding]), { findings: 0, syntheticFixtures: 2 });
});
test('v1 합성 예외도 다른 값·경로·규칙과 기존 fixture의 경로 교환을 허용하지 않는다', () => {
  for (const candidate of [
    { ...apiFinding, Secret: apiFixture + 'new' },
    { ...apiFinding, File: 'tests/other.ts' },
    { ...apiFinding, RuleID: 'github-pat' },
    { ...apiFinding, Secret: fixture },
    { ...finding, Secret: apiFixture },
  ]) {
    assert.equal(isVerifiedSyntheticFinding(candidate), false);
    assert.deepEqual(summarizeSecretReport([candidate]), { findings: 1, syntheticFixtures: 0 });
  }
});
test('mocked Blob의 정확한 합성 값만 제외한다', () => { assert.ok(source.includes('vi.mock("@vercel/blob"')); assert.ok(fixture); assert.equal(isVerifiedSyntheticFinding(finding), true); assert.deepEqual(summarizeSecretReport([finding]), { findings: 0, syntheticFixtures: 1 }); });
test('같은 fixture의 새 secret은 차단한다', () => assert.deepEqual(summarizeSecretReport([finding, { ...finding, Secret: fixture + 'new' }]), { findings: 1, syntheticFixtures: 1 }));
test('다른 파일이나 다른 rule에는 예외가 없다', () => { assert.equal(isVerifiedSyntheticFinding({ ...finding, File: 'tests/other.ts' }), false); assert.equal(isVerifiedSyntheticFinding({ ...finding, RuleID: 'github-pat' }), false); });
test('보고서 형식/필드 누락은 정상 0건이 아니다', () => { for (const value of [{}, null, [null], [{}], [{ ...finding, Secret: '' }]]) assert.throws(() => summarizeSecretReport(value), /SECRET_REPORT_INVALID/); });
test('정제 결과에 비밀/경로/원문이 포함되지 않는다', () => { const result = JSON.stringify(summarizeSecretReport([{ ...finding, Secret: 'sensitive sentinel' }])); assert.ok(!result.includes('sentinel')); assert.ok(!result.includes(finding.File)); });

test('checksum이 다른 실행 파일은 실행하지 않고 고정 오류만 보고한다', () => {
  const directory = mkdtempSync(join(tmpdir(), 'hra-secret-contract-'));
  try {
    const binary = join(directory, 'fake-binary'); writeFileSync(binary, 'sensitive sentinel', { mode: 0o700 });
    const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scan-repository-secrets.mjs', import.meta.url)), '--gitleaks', binary], { encoding: 'utf8' });
    assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.equal(run.stderr.trim(), 'SECRET_BINARY_MISMATCH');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('잘못된 CLI 인자에 원문을 반사하지 않는다', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL('../scan-repository-secrets.mjs', import.meta.url)), 'sensitive sentinel'], { encoding: 'utf8' });
  assert.equal(run.status, 1); assert.equal(run.stdout, ''); assert.equal(run.stderr.trim(), 'SECRET_ARGUMENTS_INVALID');
});
