/** 공개 소스의 대표 개인정보 표식·정확한 합성 예외·실제 Git 범위를 검증합니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPublicSourceRisks, sourceValueHash, summarizePublicSource, validateSourceFixtures } from '../_lib/public-source-policy.mjs';
const cli = fileURLToPath(new URL('../check-public-sources.mjs', import.meta.url));
// 탐지 표본은 실행 중 결합하여 유효한 연락처·세션 모양을 소스에 새로 저장하지 않습니다.
const email = ['synthetic-canary', '@', 'not-reserved', '.', 'com'].join('');
const mobile = ['010', '8765', '4321'].join('-');
const resident = ['900101', '1234567'].join('-');
const cookie = ['__Secure-authjs', '.session-token', '=', 'synthetic_session'].join('');
const jwt = ['eyJhbGciOiJub25lIn0', 'c3ludGhldGlj', 'c2lnbmF0dXJl'].join('.');

for (const domain of ['example.com', 'example.net', 'example.org', 'sub.example.com', 'sub.example.net', 'sub.example.org', 'fixture.invalid', 'sub.test', 'sub.example', 'sub.localhost', 'users.noreply.github.com', 'noreply.github.com', 'oauth.placeholder']) {
  test(`예약·기술 이메일 namespace 허용 ${domain}`, () => { assert.deepEqual(findPublicSourceRisks(`sample@${domain}`), []); });
}
for (const domain of ['example.com.attacker.com', 'oauth.placeholder.com', 'sub.oauth.placeholder', 'sub.users.noreply.github.com', 'example-company.com']) {
  test(`예약 namespace와 비슷한 일반 도메인은 거부 ${domain}`, () => { assert.equal(findPublicSourceRisks(`sample@${domain}`)[0].rule, 'SOURCE_EMAIL'); });
}
test('URL userinfo도 이메일 표식을 검사하며 URL이라는 이유로 제외하지 않음', () => {
  assert.equal(findPublicSourceRisks(`postgresql://synthetic:fake@synthetic.neon.tech/db https://fake@synthetic.blob.vercel-storage.com/file`).length, 2);
  assert.equal(findPublicSourceRisks(`https://synthetic.invalid/path ${email}`).length, 1);
});
for (const url of [`https://${email}:synthetic@host.invalid/path`, `https://${email}@host.invalid/path`]) {
  test('userinfo 이메일·이중 @ sentinel도 같은 fixture의 정확한 예외로 우회 불가', () => {
    const file = 'tests/metadata.test.ts';
    const allowed = ['known', '@', 'metadata-fixture', '.', 'com'].join('');
    const ledger = [{ file, rule: 'SOURCE_EMAIL', sha256: sourceValueHash(allowed), reason: 'SDK의 잘못된 URL 메타데이터 거부를 검사하는 합성 fixture입니다.' }];
    const summary = summarizePublicSource([{ file, text: `https://${allowed}@host.invalid/ ${url}` }], ledger);
    assert.equal(summary.syntheticFixtures, 1); assert.equal(summary.findings, 1); assert.equal(summary.rules.SOURCE_EMAIL, 1);
  });
}
for (const [rule, value] of [['SOURCE_EMAIL', email], ['SOURCE_KR_MOBILE', mobile], ['SOURCE_RESIDENT_ID', resident], ['SOURCE_SESSION_COOKIE', cookie], ['SOURCE_JWT', jwt]]) {
  test(`${rule} 표식 탐지 및 같은 파일의 새 값은 예외로 우회 불가`, () => {
    const file = 'tests/fixture.test.ts';
    const ledger = [{ file, rule, sha256: sourceValueHash(value), reason: '합성 입력을 제거하는 검증용 정확한 fixture입니다.' }];
    assert.equal(summarizePublicSource([{ file, text: value }], ledger).findings, 0);
    assert.equal(summarizePublicSource([{ file, text: value }], ledger).syntheticFixtures, 1);
    const changed = rule === 'SOURCE_EMAIL' ? value.replace('synthetic', 'different') : rule === 'SOURCE_KR_MOBILE' ? value.replace('8765', '8766') : rule === 'SOURCE_RESIDENT_ID' ? value.replace('900101', '900102') : `${value}x`;
    assert.equal(summarizePublicSource([{ file, text: changed }], ledger).findings, 1);
    assert.equal(summarizePublicSource([{ file: 'tests/other.test.ts', text: value }], ledger).findings, 1);
  });
}
for (const phone of [['+82', '10', '8765', '4321'].join(' '), ['+82', '010', '8765', '4321'].join('-'), ['010', '8765', '4321'].join('.'), ['+82(0)10', '8765', '4321'].join('-')]) {
  test('국가 코드·전화 구분자 변형 탐지', () => { assert.equal(findPublicSourceRisks(phone)[0].rule, 'SOURCE_KR_MOBILE'); });
}
test('예외 schema의 경로 우회·규칙·추가 필드·빈 이유·중복을 거부', () => {
  const entry = { file: 'tests/fixture.ts', rule: 'SOURCE_EMAIL', sha256: sourceValueHash(email), reason: '이메일 제거 동작의 합성 fixture입니다.' };
  assert.equal(validateSourceFixtures([entry]).length, 1);
  for (const patch of [{ file: 'tests/**' }, { file: '../tests/a.ts' }, { file: 'tests/../a.ts' }, { rule: 'OTHER' }, { reason: '' }, { extra: true }, { sha256: 'x' }, { sha256: [entry.sha256] }]) assert.throws(() => validateSourceFixtures([{ ...entry, ...patch }]));
  assert.throws(() => validateSourceFixtures([entry, entry]));
});

/** 임시 저장소는 현재 index 범위만 검사하며 외부 파일/원문을 결과에 기록하지 않습니다. */
async function repository(t) {
  const root = await mkdtemp(join(tmpdir(), 'hra-public-source-')); t.after(() => rm(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' }); await mkdir(join(root, 'security')); await mkdir(join(root, 'tests')); await writeFile(join(root, 'security/source-fixtures.json'), '[]');
  const put = async (file, value) => { await mkdir(join(root, file, '..'), { recursive: true }); await writeFile(join(root, file), value); };
  const add = files => execFileSync('git', ['add', '--', ...files], { cwd: root, stdio: 'ignore' });
  const run = (args = []) => spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' });
  return { root, put, add, run };
}
test('실제 CLI는 추적된 명시적 문서·fixture 범위만 검사', async t => {
  const repo = await repository(t);
  for (const file of ['README.md', 'AGENTS.md', '.env.example', '.github/ISSUE_TEMPLATE/bug.yml', '.github/PULL_REQUEST_TEMPLATE.md', 'docs/a.md', 'content/a.md', 'tests/a.ts', 'tests/academic.mts', 'tests/fixture.cts']) { await repo.put(file, 'sample@sub.example.com'); repo.add([file]); }
  await repo.put('outside.txt', email); repo.add(['outside.txt']); await repo.put('tests/untracked.ts', mobile);
  const result = repo.run(); assert.equal(result.status, 0); assert.equal(result.stderr, ''); assert.equal(JSON.parse(result.stdout).findings, 0);
  for (const file of ['.env.example', '.github/ISSUE_TEMPLATE/bug.yml', '.github/PULL_REQUEST_TEMPLATE.md', 'tests/academic.mts', 'tests/fixture.cts']) {
    await repo.put(file, email); const failed = repo.run(); assert.equal(failed.status, 1); assert.equal(JSON.parse(failed.stdout).rules.SOURCE_EMAIL, 1); await repo.put(file, 'safe');
  }
});
test('CLI의 실제 합성 예외는 새 sentinel을 막지 않고 원문·경로·줄을 출력하지 않음', async t => {
  const repo = await repository(t); const file = 'tests/fixture.ts'; await repo.put(file, mobile); repo.add([file]);
  await repo.put('security/source-fixtures.json', JSON.stringify([{ file, rule: 'SOURCE_KR_MOBILE', sha256: sourceValueHash(mobile), reason: '전화 제거 동작을 검증하는 합성 fixture입니다.' }]));
  assert.equal(repo.run().status, 0); await repo.put(file, `${mobile}\n${email}`); const result = repo.run(); assert.equal(result.status, 1);
  const summary = JSON.parse(result.stdout); assert.equal(summary.findings, 1); assert.equal(summary.syntheticFixtures, 1);
  for (const value of [email, mobile, file, repo.root]) assert.ok(!`${result.stdout}${result.stderr}`.includes(value));
});
for (const mode of ['symlink', 'parent-symlink', 'oversize', 'utf8', 'missing', 'invalid-ledger', 'unknown-argument']) {
  test(`CLI ${mode}은 원문 없는 실패`, async t => {
    const repo = await repository(t); const file = 'tests/fixture.ts'; await repo.put(file, 'safe'); repo.add([file]);
    if (mode === 'symlink') { await rm(join(repo.root, file)); await symlink('../README.md', join(repo.root, file)); }
    else if (mode === 'parent-symlink') { await rm(join(repo.root, 'tests'), { recursive: true }); await mkdir(join(repo.root, 'other')); await writeFile(join(repo.root, 'other/fixture.ts'), 'safe'); await symlink('other', join(repo.root, 'tests')); }
    else if (mode === 'oversize') await repo.put(file, 'x'.repeat(4 * 1024 * 1024 + 1));
    else if (mode === 'utf8') await repo.put(file, Buffer.from([0xff]));
    else if (mode === 'missing') await rm(join(repo.root, file));
    else if (mode === 'invalid-ledger') await repo.put('security/source-fixtures.json', '{');
    const result = repo.run(mode === 'unknown-argument' ? ['--unknown'] : []); assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'PUBLIC_SOURCE_CHECK_FAILED\n');
  });
}
