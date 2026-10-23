/** 설치 의미 대응표의 동적 외래키·readiness·실제 Git 읽기 경계를 검증합니다. DB·관리 모듈은 실행하지 않습니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, rm, symlink, copyFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { validateInstallationContract } from '../_lib/db-installation-contract.mjs';
const repository = fileURLToPath(new URL('../../', import.meta.url));
const checksum = value => createHash('sha256').update(value).digest('hex');
const evidence = file => [{ file, line: 1, note: '합성 대응표의 실제 추적 파일 근거입니다.' }];
const definition = source => [{ source, relationship: 'primary', reason: '합성 모델에서 이 객체를 직접 정의하는 소스입니다.' }];

/** 실제 source 수를 하드코딩하지 않는 작은 합성 FK 모델입니다. */
function model() {
  const sql = 'scripts/migrate-synthetic.sql', script = 'scripts/migrate-synthetic.mjs', fixture = 'tests/support/academic-g1-fixture.mjs';
  const inventory = { version: 1, sql: [{ path: sql, role: 'versioned_candidate', sha256: 'a'.repeat(64), id: 'synthetic', predecessors: [] }], scripts: [{ path: script, sha256: 'b'.repeat(64), effect: 'db_data', defaultBehavior: 'read_only', writeOptions: ['--apply'], commands: [] }], g1Order: [sql] };
  const source = (ref, objectId, required) => ({ ref, phase: required ? 'custom-definition' : 'data', fresh: { disposition: required ? 'include' : 'exclude', required, reason: required ? '합성 함수는 새 구조에 필요한 대상으로 검토합니다.' : '기존 데이터 변경은 새 구조 설치에서 제외합니다.' }, objects: [objectId], requires: [], checks: ['소스의 전체 효과와 설치 경계를 검토합니다.'], evidence: evidence(ref), unresolved: [] });
  const object = (id, kind, names, owner, required) => ({ id, kind, names, owner, definitions: definition(owner), requires: [], checks: ['선행 구조와 실제 권한·동작을 대조합니다.'], unresolved: [], requiredForFresh: required });
  const contract = { version: 1, inventoryRef: 'scripts/db/source-inventory.json', schemaExport: { entry: 'src/lib/db/schema.ts', description: '이 구조는 합성 검증용 source-only 모델입니다.', checks: ['실제 DB 관측이나 운영 적용 권한은 제공하지 않습니다.'], evidence: evidence('src/lib/db/schema.ts') },
    sources: [source(sql, 'custom', true), source(script, 'data', false)],
    objects: [object('core', 'table-set', ['public.synthetic'], 'schema-export', true), { ...object('custom', 'function-set', ['public.synthetic_fn()'], sql, true), requires: ['core'] }, object('data', 'data-effect', ['public.synthetic'], script, false)],
    fixtures: [{ id: 'synthetic', file: fixture, description: '순서 참조는 관측 참고이며 실행 이력을 뜻하지 않습니다.', steps: [{ kind: 'inventory-order', ref: 'g1Order', repeatEach: 2, note: '각 파일 반복 관측만 표현하는 합성 모델입니다.' }], exclusions: [], evidence: evidence(fixture) }] };
  return { contract, inventory };
}
const check = input => validateInstallationContract(input);
const invalid = input => { const result = check(input); assert.equal(result.ok, false); assert.equal(result.freshReady, false); return result; };

test('현재 모든 inventory 소스가 대응되지만 필수 미확정 때문에 fresh 승격은 차단', async () => {
  const contract = JSON.parse(await readFile(join(repository, 'scripts/db/installation-contract.json'), 'utf8'));
  const inventory = JSON.parse(await readFile(join(repository, 'scripts/db/source-inventory.json'), 'utf8'));
  const trackedPaths = execFileSync('git', ['ls-files', '-z'], { cwd: repository }).toString().split('\0').filter(Boolean);
  // 실제 파일을 읽기 전에 schema·경로·추적 여부를 먼저 검증합니다.
  assert.equal(check({ contract, inventory, trackedPaths }).ok, true);
  const files = new Set([contract.schemaExport.entry, ...contract.schemaExport.evidence.map(item => item.file), ...contract.sources.flatMap(item => item.evidence.map(proof => proof.file)), ...contract.fixtures.flatMap(item => [item.file, ...item.evidence.map(proof => proof.file)])]);
  const evidenceLineCounts = Object.fromEntries(await Promise.all([...files].map(async file => [file, (await readFile(join(repository, file), 'utf8')).split('\n').length])));
  const result = check({ contract, inventory, trackedPaths, evidenceLineCounts }); assert.equal(result.ok, true); assert.equal(result.coverageComplete, true); assert.equal(result.freshReady, false); assert.ok(result.counts.requiredUnresolved > 0); assert.equal(result.counts.sources, inventory.sql.length + inventory.scripts.length); assert.equal(result.observedDatabase, false); assert.equal(result.productionReady, false);
});
test('owned-local fresh 후보는 원천 근거·객체 양방향 FK·기존 fixture 제외를 갖추고 미해결을 유지', async () => {
  const contract = JSON.parse(await readFile(join(repository, 'scripts/db/installation-contract.json'), 'utf8'));
  const inventory = JSON.parse(await readFile(join(repository, 'scripts/db/source-inventory.json'), 'utf8'));
  const candidates = inventory.sql.filter(entry => entry.path.startsWith('scripts/db/candidates/db-fresh/'));
  assert.ok(candidates.length > 0);
  for (const candidate of candidates) {
    const source = contract.sources.find(entry => entry.ref === candidate.path);
    assert.ok(source, 'FRESH_SOURCE_REGISTERED');
    assert.equal(source.fresh.disposition, 'unresolved'); assert.equal(source.fresh.required, true);
    assert.ok(source.unresolved.length > 0);
    assert.ok(source.evidence.some(proof => proof.file === candidate.path));
    assert.ok(source.evidence.some(proof => proof.file !== candidate.path && !proof.file.startsWith('scripts/db/candidates/')));
    for (const objectId of source.objects) {
      const object = contract.objects.find(entry => entry.id === objectId);
      assert.ok(object, 'FRESH_PROVIDED_OBJECT_REGISTERED');
      assert.notEqual(object.owner, candidate.path, 'FRESH_LEGACY_OWNER_PRESERVED');
      assert.ok(object.definitions.some(entry => entry.source === candidate.path && entry.relationship === 'unresolved'));
      assert.ok(object.unresolved.length > 0);
    }
    for (const fixture of contract.fixtures) {
      assert.ok(fixture.exclusions.some(entry => entry.ref === candidate.path));
      assert.ok(!fixture.steps.some(entry => entry.ref === candidate.path));
    }
  }
  const result = check({ contract, inventory });
  assert.equal(result.ok, true); assert.equal(result.coverageComplete, true);
  assert.equal(result.freshReady, false); assert.equal(result.productionReady, false); assert.equal(result.observedDatabase, false);
  // 등록된 후보의 역방향 정의나 제외 근거가 하나라도 빠지면 coverage gate가 거부해야 한다.
  const first = candidates[0].path;
  const brokenDefinition = structuredClone(contract);
  const source = brokenDefinition.sources.find(entry => entry.ref === first);
  const object = brokenDefinition.objects.find(entry => entry.id === source.objects[0]);
  object.definitions = object.definitions.filter(entry => entry.source !== first);
  assert.ok(invalid({ contract: brokenDefinition, inventory }).diagnostics.includes('INSTALL_SOURCE_DEFINITION_MISSING'));
  const brokenFixture = structuredClone(contract);
  brokenFixture.fixtures[0].exclusions = brokenFixture.fixtures[0].exclusions.filter(entry => entry.ref !== first);
  assert.ok(invalid({ contract: brokenFixture, inventory }).diagnostics.includes('INSTALL_FIXTURE_COVERAGE'));
});
test('명시적인 합성 모델의 readiness도 실제 DB·운영 승인이 아님', () => {
  const result = check(model()); assert.equal(result.ok, true); assert.equal(result.freshReady, true); assert.equal(result.observedDatabase, false); assert.equal(result.productionReady, false);
});
for (const [name, mutate] of [
  ['source 누락', ({ contract }) => contract.sources.pop()],
  ['source 중복', ({ contract }) => contract.sources.push(structuredClone(contract.sources[0]))],
  ['새 SQL inventory 항목 누락', ({ inventory }) => inventory.sql.push({ ...inventory.sql[0], path: 'scripts/migrate-added.sql' })],
  ['새 MJS inventory 항목 누락', ({ inventory }) => inventory.scripts.push({ ...inventory.scripts[0], path: 'scripts/migrate-added.mjs' })],
  ['제거된 SQL 참조', ({ inventory }) => { inventory.sql = []; inventory.g1Order = []; }],
  ['제거된 MJS 참조', ({ inventory }) => { inventory.scripts = []; }],
  ['inventory 중복 path', ({ inventory }) => inventory.sql.push({ ...inventory.sql[0] })],
  ['source 경로 이탈', ({ contract }) => { contract.sources[0].ref = '../private.sql'; }],
  ['hash 복제 금지', ({ contract }) => { contract.sources[0].sha256 = 'a'.repeat(64); }],
  ['role 복제 금지', ({ contract }) => { contract.sources[0].role = 'versioned_candidate'; }],
  ['predecessor 복제 금지', ({ contract }) => { contract.sources[0].predecessors = []; }],
  ['수동 freshReady 주장 금지', ({ contract }) => { contract.freshReady = true; }],
  ['미확인 JSON key', ({ contract }) => { contract.sources[0].fresh.approved = true; }],
  ['정의 owner 누락', ({ contract }) => { contract.objects[1].definitions = []; }],
  ['정의 owner 불일치', ({ contract }) => { contract.objects[1].owner = 'schema-export'; }],
  ['정의 중복', ({ contract }) => contract.objects[1].definitions.push({ ...contract.objects[1].definitions[0] })],
  ['정의 unknown FK', ({ contract }) => { contract.objects[1].definitions[0].source = 'scripts/migrate-unknown.sql'; }],
  ['객체 중복 ID', ({ contract }) => contract.objects.push(structuredClone(contract.objects[0]))],
  ['객체 중복 이름', ({ contract }) => contract.objects.push({ ...structuredClone(contract.objects[0]), id: 'other-core' })],
  ['객체 unknown FK', ({ contract }) => contract.sources[0].objects.push('missing')],
  ['객체의 source 역참조 누락', ({ contract }) => { contract.sources[0].objects = ['core']; }],
  ['미확인 선행 객체', ({ contract }) => contract.objects[1].requires.push('missing')],
  ['순환 선행 객체', ({ contract }) => contract.objects[0].requires.push('custom')],
  ['빈 체크리스트', ({ contract }) => { contract.objects[1].checks = []; }],
  ['미확정 설명 누락', ({ contract }) => { contract.objects[1].definitions[0].relationship = 'unresolved'; }],
  ['required source 제외 모순', ({ contract }) => { contract.sources[0].fresh.disposition = 'exclude'; }],
  ['include 상태의 미확정 숨김', ({ contract }) => contract.sources[0].unresolved.push('아직 설치 의미를 검증하지 않았습니다.')],
  ['0번 증거 행', ({ contract }) => { contract.sources[0].evidence[0].line = 0; }],
  ['증거 URL', ({ contract }) => { contract.sources[0].evidence[0].file = 'https://synthetic.invalid/source'; }],
  ['schema 진입점 근거 누락', ({ contract }) => { contract.schemaExport.evidence = evidence(contract.sources[0].ref); }],
  ['fixture 직접 근거 누락', ({ contract }) => { contract.fixtures[0].evidence = evidence(contract.sources[0].ref); }],
  ['fixture 누락', ({ contract }) => { contract.fixtures = []; }],
  ['fixture g1Order 참조 변경', ({ contract }) => { contract.fixtures[0].steps[0].ref = 'invented'; }],
]) {
  test(`${name}은 고정 진단으로 거부`, () => { const input = model(); mutate(input); invalid(input); });
}
test('새 항목을 실제 의미 대응과 함께 추가할 때 현재 소스 수에 묶이지 않음', () => {
  const input = model(), added = 'scripts/migrate-added.mjs'; input.inventory.scripts.push({ ...input.inventory.scripts[0], path: added });
  input.contract.sources.push({ ...structuredClone(input.contract.sources[1]), ref: added, objects: ['added'], evidence: evidence(added) });
  input.contract.objects.push({ ...structuredClone(input.contract.objects[2]), id: 'added', names: ['public.synthetic_added'], owner: added, definitions: definition(added) });
  const result = check(input); assert.equal(result.ok, true); assert.equal(result.coverageComplete, true); assert.equal(result.counts.sources, 3);
});
test('제거를 inventory·대응표 양쪽에 반영하면 고정 소스 개수 없이 수용', () => {
  const input = model(); input.inventory.scripts = []; input.contract.sources.pop(); input.contract.objects.pop(); const result = check(input); assert.equal(result.ok, true); assert.equal(result.counts.sources, 1);
});
for (const [name, mutate] of [
  ['required 객체의 primary owner 제외', ({ contract }) => { contract.sources[0].fresh.required = false; contract.sources[0].fresh.disposition = 'exclude'; }],
  ['source.requires의 제외 객체', ({ contract }) => contract.sources[0].requires.push('data')],
  ['object.requires의 제외 객체', ({ contract }) => contract.objects[1].requires.push('data')],
  ['간접 prerequisite의 제외 객체', ({ contract }) => contract.objects[0].requires.push('data')],
  ['required 객체 owner 미확정', ({ contract }) => { contract.sources[0].fresh.disposition = 'unresolved'; contract.sources[0].unresolved = ['소유 함수의 설치 의미가 아직 미확정입니다.']; }],
]) {
  test(`${name}은 coverage와 별개로 fresh 승격 차단`, () => { const input = model(); mutate(input); const result = check(input); assert.equal(result.coverageComplete, true); assert.equal(result.freshReady, false); assert.ok(result.counts.requiredUnresolved > 0); });
}
test('tracked source 근거와 실제 행 범위를 함께 검사', () => {
  const input = model(); const trackedPaths = ['src/lib/db/schema.ts', ...input.contract.sources.map(item => item.ref), input.contract.fixtures[0].file]; const evidenceLineCounts = Object.fromEntries(trackedPaths.map(file => [file, 1]));
  assert.equal(check({ ...input, trackedPaths, evidenceLineCounts }).ok, true);
  assert.ok(invalid({ ...input, trackedPaths: trackedPaths.filter(file => file !== input.contract.fixtures[0].file), evidenceLineCounts }).diagnostics.includes('INSTALL_EVIDENCE_UNTRACKED'));
  assert.ok(invalid({ ...input, trackedPaths: trackedPaths.filter(file => file !== input.contract.schemaExport.entry), evidenceLineCounts }).diagnostics.includes('INSTALL_EVIDENCE_UNTRACKED'));
  input.contract.sources[0].evidence[0].line = 2; assert.ok(invalid({ ...input, trackedPaths, evidenceLineCounts }).diagnostics.includes('INSTALL_EVIDENCE_LOCATION'));
});

/** 새 temp Git에 실제 CLI·순수 기존 검사기만 복사하고 관리 MJS는 실행되면 실패하는 sentinel로 둡니다. */
async function temporaryRepository(t) {
  const root = await mkdtemp(join(tmpdir(), 'hra-install-contract-')); t.after(() => rm(root, { recursive: true, force: true }));
  const put = async (file, value) => { await mkdir(dirname(join(root, file)), { recursive: true }); await writeFile(join(root, file), value); };
  for (const file of ['scripts/check-db-installation-contract.mjs', 'scripts/_lib/db-installation-contract.mjs', 'scripts/check-db-source-inventory.mjs', 'scripts/_lib/db-source-inventory.mjs']) { await mkdir(dirname(join(root, file)), { recursive: true }); await copyFile(join(repository, file), join(root, file)); }
  await symlink(join(repository, 'node_modules'), join(root, 'node_modules'), 'dir');
  const input = model(); const sqlBytes = 'CREATE FUNCTION public.synthetic_fn() RETURNS integer LANGUAGE sql AS \'SELECT 1\';\n'; const scriptBytes = 'throw new Error("SYNTHETIC_MANAGEMENT_MODULE_MUST_NOT_RUN");\n';
  input.inventory.sql[0].sha256 = checksum(sqlBytes); input.inventory.scripts[0].sha256 = checksum(scriptBytes);
  await put(input.inventory.sql[0].path, sqlBytes); await put(input.inventory.scripts[0].path, scriptBytes);
  await put('src/lib/db/schema.ts', 'export const synthetic = true;\n'); await put('tests/support/academic-g1-fixture.mjs', 'export const academicG1Migrations = ["migrate-synthetic.sql"];\n');
  await put('package.json', '{"scripts":{}}\n'); await put('scripts/db/source-inventory.json', JSON.stringify(input.inventory)); await put('scripts/db/installation-contract.json', JSON.stringify(input.contract));
  execFileSync('git', ['init', '-q'], { cwd: root, stdio: 'ignore' }); execFileSync('git', ['add', '--', 'scripts', 'src', 'tests', 'package.json'], { cwd: root, stdio: 'ignore' });
  const run = (options = {}) => spawnSync(process.execPath, [...(options.preload ? ['--require', options.preload] : []), 'scripts/check-db-installation-contract.mjs', ...(options.args ?? [])], { cwd: root, encoding: 'utf8', timeout: 40000 });
  return { root, input, put, run };
}
test('temp Git CLI는 source bytes와 근거만 읽고 관리 모듈은 import하지 않음', async t => {
  const repo = await temporaryRepository(t); const result = repo.run(); assert.equal(result.status, 0); const summary = JSON.parse(result.stdout); assert.equal(summary.coverageComplete, true); assert.equal(summary.freshReady, true); assert.equal(summary.observedDatabase, false); assert.ok(!`${result.stdout}${result.stderr}`.includes('SYNTHETIC_MANAGEMENT_MODULE_MUST_NOT_RUN'));
});
for (const mode of ['hash', 'untracked-contract', 'missing-evidence', 'symlink', 'parent-symlink', 'traversal', 'unknown', 'duplicate-json-key', 'unknown-argument']) {
  test(`temp Git ${mode} 실패는 원문·경로를 반사하지 않음`, async t => {
    const repo = await temporaryRepository(t);
    if (mode === 'hash') await repo.put(repo.input.inventory.scripts[0].path, 'throw new Error("SYNTHETIC_PRIVATE_DO_NOT_REFLECT");');
    else if (mode === 'untracked-contract') execFileSync('git', ['rm', '--cached', '--', 'scripts/db/installation-contract.json'], { cwd: repo.root, stdio: 'ignore' });
    else if (mode === 'missing-evidence') await rm(join(repo.root, 'src/lib/db/schema.ts'));
    else if (mode === 'symlink') { await rm(join(repo.root, 'src/lib/db/schema.ts')); await symlink(join(repo.root, 'package.json'), join(repo.root, 'src/lib/db/schema.ts')); }
    else if (mode === 'parent-symlink') { await rm(join(repo.root, 'src/lib/db'), { recursive: true }); await symlink(join(repo.root, 'scripts'), join(repo.root, 'src/lib/db'), 'dir'); }
    else if (mode === 'traversal') { repo.input.contract.sources[0].evidence[0].file = '../SYNTHETIC_PRIVATE_DO_NOT_REFLECT'; await repo.put('scripts/db/installation-contract.json', JSON.stringify(repo.input.contract)); }
    else if (mode === 'unknown') { repo.input.contract.rawSql = 'SYNTHETIC_PRIVATE_DO_NOT_REFLECT'; await repo.put('scripts/db/installation-contract.json', JSON.stringify(repo.input.contract)); }
    else if (mode === 'duplicate-json-key') await repo.put('scripts/db/installation-contract.json', JSON.stringify(repo.input.contract).replace('{', '{"version":999,'));
    const result = repo.run(mode === 'unknown-argument' ? { args: ['--unknown'] } : {}); assert.equal(result.status, 1); assert.ok(!`${result.stdout}${result.stderr}`.includes('SYNTHETIC_PRIVATE_DO_NOT_REFLECT')); assert.ok(!`${result.stdout}${result.stderr}`.includes(repo.root));
    if (result.stdout) assert.equal(JSON.parse(result.stdout).ok, false); else assert.match(result.stderr, /^(?:INSTALLATION_CONTRACT_FAILED|INSTALL_SOURCE_INVENTORY_INVALID)\n$/);
  });
}
test('lstat 뒤 파일을 symlink로 교체해도 O_NOFOLLOW가 마지막 파일을 거부', async t => {
  const repo = await temporaryRepository(t), preload = join(repo.root, 'race.cjs');
  await writeFile(preload, `const fs=require('node:fs');const original=fs.openSync;let armed=true;fs.openSync=function(file,...args){if(armed&&String(file).endsWith('/scripts/db/installation-contract.json')){armed=false;fs.unlinkSync(file);fs.symlinkSync(${JSON.stringify(join(repo.root, 'package.json'))},file);}return original.call(this,file,...args);};`);
  const result = repo.run({ preload }); assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'INSTALLATION_CONTRACT_FAILED\n');
});

/** source 간 선행조건을 검증하는 합성 owner를 실제 inventory FK 형태로 추가합니다. */
function additionalOwner(input, suffix) {
  const ref = `scripts/migrate-owner-${suffix}.sql`, objectId = `owner-${suffix}`;
  input.inventory.sql.push({ ...structuredClone(input.inventory.sql[0]), path: ref, id: objectId, predecessors: [] });
  input.contract.sources.push({ ...structuredClone(input.contract.sources[0]), ref, objects: [objectId], requires: [], evidence: evidence(ref) });
  input.contract.objects.push({ ...structuredClone(input.contract.objects[1]), id: objectId, names: [`public.owner_${suffix}()`], owner: ref, definitions: definition(ref), requires: ['core'] });
  input.contract.fixtures[0].exclusions.push({ ref, reason: '이 합성 fixture 부분집합 밖의 추가 정의입니다.' });
  return { ref, objectId, source: input.contract.sources.at(-1), object: input.contract.objects.at(-1) };
}
test('두 source의 requires가 서로 다른 primary owner를 요구하면 순환 거부', () => {
  const input = model(), second = additionalOwner(input, 'b');
  input.contract.sources[0].requires = [second.objectId]; second.source.requires = ['custom'];
  const result = invalid(input); assert.ok(result.diagnostics.includes('INSTALL_SOURCE_CYCLE'));
});
test('길이 3 source 순환도 object.requires가 비순환이어도 거부', () => {
  const input = model(), second = additionalOwner(input, 'b'), third = additionalOwner(input, 'c');
  input.contract.sources[0].requires = [second.objectId]; second.source.requires = [third.objectId]; third.source.requires = ['custom'];
  const result = invalid(input); assert.ok(result.diagnostics.includes('INSTALL_SOURCE_CYCLE'));
});
test('제공 객체의 object.requires 경유 source 의존성도 source.requires와 함께 순환 검사', () => {
  const input = model(), second = additionalOwner(input, 'b');
  input.contract.sources[0].requires = [second.objectId]; second.object.requires = ['custom'];
  const result = invalid(input); assert.ok(result.diagnostics.includes('INSTALL_SOURCE_CYCLE')); assert.ok(!result.diagnostics.includes('INSTALL_PREREQUISITE_CYCLE'));
});
test('제공 객체에서 시작한 선행 owner와 반대 source.requires의 혼합 순환 거부', () => {
  const input = model(), second = additionalOwner(input, 'b');
  input.contract.objects[1].requires.push(second.objectId); second.source.requires = ['custom'];
  const result = invalid(input); assert.ok(result.diagnostics.includes('INSTALL_SOURCE_CYCLE'));
});
test('schema-export 소유 객체와 동일 source 내부 객체는 외부 source 순환이 아님', () => {
  const input = model(); input.contract.sources[0].requires = ['core', 'custom'];
  const result = check(input); assert.equal(result.ok, true); assert.equal(result.freshReady, true); assert.ok(!result.diagnostics.includes('INSTALL_SOURCE_CYCLE'));
});
test('inventory predecessor와 의미상 owner 선행조건 사이의 교차 순환도 거부', () => {
  const input = model(), second = additionalOwner(input, 'b');
  input.inventory.sql.at(-1).predecessors = [input.inventory.sql[0].id]; input.contract.sources[0].requires = [second.objectId];
  const result = invalid(input); assert.ok(result.diagnostics.includes('INSTALL_SOURCE_CYCLE'));
});
