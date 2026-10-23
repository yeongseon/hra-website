/** 소유 연결을 만들기 전 migration engine 입력·출력 경계의 순수 계약을 검증합니다. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { runLocalMigrations, localMigrationLock, localMigrationBootstrapSql } from '../_lib/db-migration-local-engine.mjs';

/** source와 기대 catalog는 테스트마다 분리하여 호출자의 변경을 공유하지 않습니다. */
function fixture() {
  const path = 'scripts/db/versioned/synthetic.sql';
  const bytes = Buffer.from('CREATE TABLE public.hra_migration_probe(id integer,value text);');
  const manifest = { schemaVersion: 1, state: 'configured', executionContract: 'postgresql-file-transaction-v1', migrations: [{ id: 'synthetic', sequence: 1, path, sha256: createHash('sha256').update(bytes).digest('hex'), transaction: 'required' }] };
  const source = { manifest, fileContents: { [path]: bytes }, trackedSqlPaths: [path], untrackedSqlPaths: [], symlinkPaths: [] };
  const counts = { schemas: 2, tables: 1, columns: 4, types: 0, functions: 0, constraints: 5, indexes: 2, views: 0, triggers: 0, policies: 0, probeRows: 0 };
  const catalogContracts = [{ digest: 'a'.repeat(64), counts: { ...counts } }, { digest: 'b'.repeat(64), counts: { ...counts, tables: 2 } }];
  return { source, catalogContracts };
}
/** public API 모양을 흉내낸 객체로 소유 연결 등록을 대체할 수 없습니다. */
function unowned() {
  let opens = 0;
  return { factory: { expectedIdentity: Object.freeze({ databaseId: 'synthetic', scopeId: 'synthetic' }), async open() { opens++; throw new Error('SYNTHETIC_RAW_DO_NOT_REPORT'); } }, opens: () => opens };
}
function privateResult(result) {
  assert.equal(typeof result.firstErrorCode, 'string');
  assert.equal(result.productionReady, false); assert.equal(result.manifestCompleted, false);
  assert.ok(!JSON.stringify(result).includes('SYNTHETIC_RAW_DO_NOT_REPORT'));
  assert.deepEqual(Object.keys(result).sort(), ['phase', 'code', 'firstErrorCode', 'phases', 'applied', 'pending', 'manifestCompleted', 'manifestDigest', 'catalogDigest', 'cleanupComplete', 'cleanupCodes', 'observedLocalDatabase', 'productionReady'].sort());
}
test('모양만 같은 factory는 실제 접속 전에 거부', async () => {
  const input = fixture(), fake = unowned(); const result = await runLocalMigrations({ ...input, factory: fake.factory });
  assert.equal(result.code, 'FACTORY_UNOWNED'); assert.equal(fake.opens(), 0); assert.equal(result.observedLocalDatabase, false); privateResult(result);
});
test('미설정 manifest는 빈 적용 성공이 아닌 명시적 차단', async () => {
  const input = fixture(), fake = unowned(); input.source.manifest.state = 'unset'; input.source.manifest.migrations = []; input.source.fileContents = {}; input.source.trackedSqlPaths = []; input.catalogContracts = input.catalogContracts.slice(0, 1);
  const result = await runLocalMigrations({ ...input, factory: fake.factory }); assert.equal(result.code, 'MANIFEST_UNSET'); assert.equal(fake.opens(), 0); privateResult(result);
});
for (const [name, mutate] of [
  ['checksum 변경', input => { input.source.fileContents[input.source.trackedSqlPaths[0]][0] = 0; }],
  ['순서 변경', input => { input.source.manifest.migrations[0].sequence = 2; }],
  ['경로 우회', input => { input.source.manifest.migrations[0].path = '../synthetic.sql'; }],
  ['미등록 SQL', input => { input.source.untrackedSqlPaths.push('scripts/db/versioned/other.sql'); }],
  ['source symlink', input => { input.source.symlinkPaths.push('scripts/db/versioned'); }],
  ['임의 authority 필드', input => { input.source.approved = true; }],
]) {
  test(`${name} source는 소유 DB를 열기 전에 차단`, async () => {
    const input = fixture(), fake = unowned(); mutate(input); const result = await runLocalMigrations({ ...input, factory: fake.factory }); assert.equal(result.code, 'SOURCE_INVALID'); assert.equal(fake.opens(), 0); privateResult(result);
  });
}
for (const value of [0, 99, 30001, Infinity, '10000']) {
  test(`잘못된 timeout 값은 접속 전에 차단 ${value}`, async () => {
    const fake = unowned(); const result = await runLocalMigrations({ ...fixture(), factory: fake.factory, timeoutMs: value }); assert.equal(result.code, 'TIMEOUT_INVALID'); assert.equal(fake.opens(), 0); privateResult(result);
  });
}
for (const [name, mutate] of [
  ['누락 prefix', input => input.catalogContracts.pop()],
  ['부가 원문 필드', input => { input.catalogContracts[0].sql = 'SYNTHETIC_RAW_DO_NOT_REPORT'; }],
  ['잘못된 해시', input => { input.catalogContracts[0].digest = ['a'.repeat(64)]; }],
  ['누락 count', input => { delete input.catalogContracts[0].counts.triggers; }],
  ['음수 count', input => { input.catalogContracts[0].counts.tables = -1; }],
]) {
  test(`${name} 기대 catalog는 사전 계약에서 차단`, async () => {
    const input = fixture(), fake = unowned(); mutate(input); const result = await runLocalMigrations({ ...input, factory: fake.factory }); assert.equal(result.code, 'CATALOG_CONTRACT_INVALID'); assert.equal(fake.opens(), 0); privateResult(result);
  });
}
test('잘못된 signal 객체를 공개 AbortSignal처럼 해석하지 않음', async () => {
  const fake = unowned(); const result = await runLocalMigrations({ ...fixture(), factory: fake.factory, signal: { aborted: false } }); assert.equal(result.code, 'SIGNAL_INVALID'); assert.equal(fake.opens(), 0);
});
test('원본 byte 배열과 descriptor는 순수 사전 검증에서 변경하지 않음', async () => {
  const input = fixture(), original = Buffer.from(input.source.fileContents[input.source.trackedSqlPaths[0]]), descriptor = JSON.stringify(input.source.manifest);
  await runLocalMigrations({ ...input, factory: unowned().factory }); assert.deepEqual(input.source.fileContents[input.source.trackedSqlPaths[0]], original); assert.equal(JSON.stringify(input.source.manifest), descriptor);
});
test('모든 manifest가 같은 두 정수 lock과 자체 단일 ledger를 사용', () => {
  assert.deepEqual(localMigrationLock, [145311847, 280]); assert.equal(Object.isFrozen(localMigrationLock), true);
  assert.match(localMigrationBootstrapSql, /hra_migrations\.applied_migrations/); assert.doesNotMatch(localMigrationBootstrapSql, /__drizzle_migrations|CREATE ROLE|SUPERUSER/i);
});

test('이미 취소된 실행은 factory 검사·open 전에 중단', async () => {
  const fake = unowned(), controller = new AbortController(); controller.abort();
  const result = await runLocalMigrations({ ...fixture(), factory: fake.factory, signal: controller.signal });
  assert.equal(result.code, 'INTERRUPTED'); assert.equal(fake.opens(), 0); assert.equal(result.observedLocalDatabase, false); privateResult(result);
});
test('정확 checksum이어도 파일 크기 상한을 넘으면 실행하지 않음', async () => {
  const input = fixture(), fake = unowned(), path = input.source.trackedSqlPaths[0];
  input.source.fileContents[path] = Buffer.alloc(2 * 1024 * 1024 + 1, 120);
  input.source.manifest.migrations[0].sha256 = createHash('sha256').update(input.source.fileContents[path]).digest('hex');
  const result = await runLocalMigrations({ ...input, factory: fake.factory }); assert.equal(result.code, 'SOURCE_LIMIT'); assert.equal(fake.opens(), 0);
});
test('정확 checksum이어도 잘못된 UTF-8 bytes는 실행하지 않음', async () => {
  const input = fixture(), fake = unowned(), path = input.source.trackedSqlPaths[0];
  input.source.fileContents[path] = Buffer.from([255]); input.source.manifest.migrations[0].sha256 = createHash('sha256').update(input.source.fileContents[path]).digest('hex');
  const result = await runLocalMigrations({ ...input, factory: fake.factory }); assert.equal(result.code, 'SOURCE_ENCODING'); assert.equal(fake.opens(), 0);
});
test('각 파일이 상한 이내여도 전체 16MiB를 넘으면 실행하지 않음', async () => {
  const input = fixture(), fake = unowned(), bytes = Buffer.alloc(2 * 1024 * 1024, 120), checksum = createHash('sha256').update(bytes).digest('hex');
  input.source.manifest.migrations = []; input.source.fileContents = {}; input.source.trackedSqlPaths = [];
  for (let index = 0; index < 9; index++) {
    const path = `scripts/db/versioned/synthetic-${index}.sql`;
    input.source.manifest.migrations.push({ id: `synthetic-${index}`, sequence: index + 1, path, sha256: checksum, transaction: 'required' });
    input.source.fileContents[path] = bytes; input.source.trackedSqlPaths.push(path);
  }
  input.catalogContracts = Array.from({ length: 10 }, () => input.catalogContracts[0]);
  const result = await runLocalMigrations({ ...input, factory: fake.factory }); assert.equal(result.code, 'SOURCE_LIMIT'); assert.equal(fake.opens(), 0);
});

for (const input of [null, [], true, 'synthetic', () => {}, { url: 'SYNTHETIC_RAW_DO_NOT_REPORT' }]) {
  test('잘못된 최상위 입력은 원본 예외 대신 닫힌 결과로 반환', async () => {
    const result = await runLocalMigrations(input); assert.equal(result.code, 'INPUT_INVALID'); privateResult(result);
  });
}
test('외부 예외의 safeEngineCode 흉내와 원문을 공개 결과에 채택하지 않음', async () => {
  const fake = unowned();
  const input = { factory: fake.factory, catalogContracts: fixture().catalogContracts };
  Object.defineProperty(input, 'source', { enumerable: true, get() { throw Object.assign(new Error('SYNTHETIC_RAW_DO_NOT_REPORT'), { safeEngineCode: 'SYNTHETIC_RAW_DO_NOT_REPORT' }); } });
  const result = await runLocalMigrations(input); assert.equal(result.code, 'LOCAL_OPERATION_FAILED'); assert.equal(result.firstErrorCode, 'LOCAL_OPERATION_FAILED'); assert.equal(fake.opens(), 0); privateResult(result);
});
