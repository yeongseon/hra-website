/**
 * 실제 소유 Unix PostgreSQL·Neon pinned client로 S2 로컬 적용/복구 경계를 검증한다.
 * 사전 C[k]는 별도 reference DB에서 만들고 대상 관측값으로 기대값을 덮어쓰지 않는다.
 * SQL·카탈로그 원문·driver 오류는 assertion 출력에 넣지 않는다.
 */
import { test } from "node:test";
import { mkdtemp, writeFile, readFile, chmod, symlink, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { neonConfig } from "@neondatabase/serverless";
import { createOwnedLocalFactory, assertOwnedLocalFactory } from "../support/db-migration-local-adapter.mjs";
import { collectLocalCatalog } from "../support/db-migration-catalog.mjs";
import { runLocalMigrations, localMigrationBootstrapSql, localMigrationLock } from "../../scripts/_lib/db-migration-local-engine.mjs";

const postgresBin = process.env.HRA_TEST_PG_BIN;
assert.ok(postgresBin, "LOCAL_PG_BIN_REQUIRED");
const fixedPath = "SET search_path TO pg_catalog, public";
const migrationSql = [
  `CREATE TABLE public.hra_migration_probe(id integer PRIMARY KEY,value text NOT NULL);
   CREATE TABLE public.hra_migration_gate(value integer NOT NULL); INSERT INTO public.hra_migration_gate VALUES(1);
   CREATE TABLE public.hra_parent(id integer PRIMARY KEY);
   CREATE TABLE public.hra_child(id integer PRIMARY KEY,parent_id integer REFERENCES public.hra_parent(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED);
   CREATE FUNCTION public.hra_probe_label(input integer) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS 'SELECT input::text';
   CREATE FUNCTION public.hra_probe_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,public AS $body$ BEGIN IF NEW.value='blocked' THEN RAISE EXCEPTION 'SYNTHETIC_REJECTED' USING ERRCODE='23514'; END IF; RETURN NEW; END $body$;
   CREATE CONSTRAINT TRIGGER hra_probe_guard AFTER INSERT OR UPDATE ON public.hra_migration_probe DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.hra_probe_guard();
   CREATE INDEX hra_probe_value_idx ON public.hra_migration_probe(value);
   CREATE VIEW public.hra_probe_view AS SELECT id,value FROM public.hra_migration_probe;
   ALTER TABLE public.hra_migration_probe ENABLE ROW LEVEL SECURITY;
   CREATE POLICY hra_probe_read ON public.hra_migration_probe FOR SELECT TO PUBLIC USING(true);
   INSERT INTO public.hra_migration_probe VALUES(1,'first'); INSERT INTO public.hra_parent VALUES(1); INSERT INTO public.hra_child VALUES(1,1);`,
  "CREATE TABLE public.hra_second_table(id integer PRIMARY KEY); INSERT INTO public.hra_migration_probe VALUES(2,'second'); SELECT 1/value FROM public.hra_migration_gate;",
  "INSERT INTO public.hra_migration_probe VALUES(3,'third');",
];
const check = (condition, code) => assert.ok(condition, code);
const sourceFor = (sql = migrationSql) => {
  const migrations = sql.map((text, index) => ({ id: `local-${index + 1}`, sequence: index + 1,
    path: `scripts/db/versioned/local-${index + 1}.sql`, sha256: createHash("sha256").update(text).digest("hex"), transaction: "required" }));
  return { manifest: { schemaVersion: 1, state: "configured", executionContract: "postgresql-file-transaction-v1", migrations },
    fileContents: Object.fromEntries(migrations.map((entry, index) => [entry.path, Buffer.from(sql[index])])),
    trackedSqlPaths: migrations.map(entry => entry.path), untrackedSqlPaths: [], symlinkPaths: [] };
};

/** 성공·실패와 무관하게 소유 factory만 닫고 고정 cleanup 값만 공개한다. */
async function owned(t) {
  const factory = createOwnedLocalFactory({ postgresBin });
  t.after(async () => {
    await factory.close();
    const evidence = factory.evidence();
    check(evidence.cleanupComplete && evidence.clusterRemoved && evidence.activeSockets === 0 && evidence.activeSessions === 0 && evidence.openedSockets === evidence.closedSockets && evidence.configurationRestored, "OWNED_CLEANUP_FAILED");
  });
  return factory;
}
async function query(factory, text, values) {
  const session = await factory.open();
  try { await session.query(fixedPath); return await session.query(text, values); }
  finally { await session.close(); }
}
async function ready(factory) { const session = await factory.open(); await session.query(fixedPath); return session; }
async function applyReference(session, source, count) {
  for (let index = 0; index < count; index++) {
    const migration = source.manifest.migrations[index];
    await session.query("BEGIN");
    await session.query(source.fileContents[migration.path].toString("utf8"));
    await session.query("INSERT INTO hra_migrations.applied_migrations(id,sequence,sha256,status) VALUES($1,$2,$3,'applied')", [migration.id, migration.sequence, migration.sha256]);
    await session.query("COMMIT");
  }
}
let referencePromise;
async function contracts() {
  if (!referencePromise) referencePromise = (async () => {
    const factory = createOwnedLocalFactory({ postgresBin });
    try {
      const session = await ready(factory), source = sourceFor(), result = [];
      try {
        await session.query(localMigrationBootstrapSql);
        result.push(await collectLocalCatalog(session));
        for (let index = 0; index < migrationSql.length; index++) {
          const migration = source.manifest.migrations[index];
          await session.query("BEGIN"); await session.query(migrationSql[index]);
          await session.query("INSERT INTO hra_migrations.applied_migrations(id,sequence,sha256,status) VALUES($1,$2,$3,'applied')", [migration.id, migration.sequence, migration.sha256]);
          await session.query("COMMIT"); result.push(await collectLocalCatalog(session));
        }
      } finally { await session.close(); }
      return Object.freeze(result);
    } finally { await factory.close(); check(factory.evidence().cleanupComplete, "REFERENCE_CLEANUP_FAILED"); }
  })();
  return referencePromise;
}
const run = async (factory, source = sourceFor(), extra = {}) => runLocalMigrations({ factory, source,
  catalogContracts: (await contracts()).slice(0, source.manifest.migrations.length + 1), ...extra });
const ledgerCount = async factory => Number((await query(factory, "SELECT count(*) AS count FROM hra_migrations.applied_migrations")).rows[0].count);

/** 원본 identity는 비교 결과로 바꾸고 PID·target 원문을 assertion에 전달하지 않는다. */
test("소유 capability·최소 role·서로 다른 scope의 병렬 연결·SDK 설정 복구", async t => {
  const a = await owned(t), b = await owned(t);
  const original = { constructor: neonConfig.webSocketConstructor, proxy: neonConfig.wsProxy, fetch: globalThis.fetch };
  check(Object.isFrozen(a) && Object.isFrozen(a.expectedIdentity) && Object.isFrozen(a.faults), "CAPABILITY_MUTABLE");
  assert.throws(() => { a.open = () => null; }, TypeError);
  assert.throws(() => assertOwnedLocalFactory({ ...a }), /LOCAL_FACTORY_NOT_OWNED/);
  assert.throws(() => createOwnedLocalFactory({ postgresBin, url: "remote-target" }), /LOCAL_FACTORY_OPTIONS_INVALID/);
  const [one, two] = await Promise.all([a.open(), b.open()]);
  try {
    const [first, second] = await Promise.all([one.identity(), two.identity()]);
    check(first.scopeId === a.expectedIdentity.scopeId && second.scopeId === b.expectedIdentity.scopeId && first.scopeId !== second.scopeId, "FACTORY_SCOPE_MIXED");
    check(first.databaseId === a.expectedIdentity.databaseId && second.databaseId === b.expectedIdentity.databaseId, "FACTORY_DATABASE_MIXED");
    const privilege = (await one.query("SELECT rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls FROM pg_catalog.pg_roles WHERE rolname=current_user")).rows[0];
    check(Object.values(privilege).every(value => value === false), "ROLE_ELEVATED");
    await assert.rejects(one.query("UPDATE hra_local_scope.identity SET scope_id='forbidden'"), error => error.code === "42501");
  } finally { await one.close(); await two.close(); }
  check(neonConfig.webSocketConstructor === original.constructor && neonConfig.wsProxy === original.proxy && globalThis.fetch === original.fetch, "SDK_GLOBAL_NOT_RESTORED");
});

test("정상 전체 적용·불변 bytes 재실행·prefix append에서 SQL 재실행 0", async t => {
  const factory = await owned(t), prefix = sourceFor(migrationSql.slice(0, 2));
  const first = await run(factory, prefix);
  check(first.manifestCompleted && first.applied === 2 && first.cleanupComplete && first.productionReady === false, "PREFIX_APPLY_FAILED");
  const before = factory.evidence().helperCalls;
  const repeated = await run(factory, prefix);
  check(repeated.manifestCompleted && factory.evidence().helperCalls === before, "SQL_REPLAYED");
  const appended = await run(factory);
  check(appended.manifestCompleted && appended.applied === 3 && appended.pending === 0 && factory.evidence().helperCalls === before + 1, "APPEND_FAILED");
  check(await ledgerCount(factory) === 3, "LEDGER_COUNT");
});

for (const position of [1, 2, 3]) test(`실제 COMMIT ACK 유실 ${position}: prefix C[k] 전체복구와 자동재실행0`, async t => {
  const factory = await owned(t);
  factory.faults.dropCommitAckAt(position);
  const result = await run(factory);
  check(result.phase === "VERIFIED" && result.phases.includes("COMMIT_OUTCOME_UNKNOWN") && result.applied === position && result.pending === 3 - position && result.manifestCompleted === (position === 3), "ACK_RECONCILIATION_FAILED");
  check(factory.evidence().droppedCommitAcks === 1 && factory.evidence().helperCalls === position && result.cleanupComplete, "ACK_NOT_TRANSPORT_FAULT");
  check(await ledgerCount(factory) === position, "ACK_LEDGER_COUNT");
  if (position < 3) {
    const resumed = await run(factory);
    check(resumed.manifestCompleted && factory.evidence().helperCalls === 3, "EXPLICIT_RESUME_FAILED");
  }
});

test("사전 abort는 연결0이고 늦은 open/close 경합도 세션을 남기지 않는다", async t => {
  const factory = await owned(t), controller = new AbortController(); controller.abort();
  const aborted = await run(factory, sourceFor(), { signal: controller.signal });
  check(aborted.code === "INTERRUPTED" && factory.evidence().openedSockets === 0, "PRE_ABORT_CONNECTED");
  factory.faults.beforeNextOpen(() => delay(300));
  const late = await run(factory, sourceFor(), { timeoutMs: 100 });
  check(late.code === "CONNECT_TIMEOUT" && late.cleanupComplete && factory.evidence().activeSockets === 0, "LATE_OPEN_LEAKED");
  const other = await owned(t);
  factory.faults.beforeNextOpen(() => delay(100));
  factory.faults.nextOpenUses(other);
  const opening = factory.open();
  const rejection = opening.then(() => false, () => true);
  await delay(20); await factory.close();
  check(await rejection, "CLOSED_FACTORY_OPENED");
  check(factory.evidence().cleanupComplete && other.evidence().activeSessions === 0 && other.evidence().openedSockets === 0, "DELAYED_FOREIGN_OPEN_LEAKED");
});

test("연결 전에 복제한 manifest/bytes/catalog 기대값은 caller 변경으로 대체되지 않는다", async t => {
  const factory = await owned(t), source = sourceFor(), expected = structuredClone(await contracts());
  factory.faults.beforeNextOpen(() => {
    const entry = source.manifest.migrations[0];
    const changed = Buffer.from(migrationSql[0].replace("'first'", "'caller-mutated'"));
    source.fileContents[entry.path] = changed; entry.sha256 = createHash("sha256").update(changed).digest("hex");
    expected[0].digest = "f".repeat(64);
  });
  const result = await runLocalMigrations({ factory, source, catalogContracts: expected });
  check(result.manifestCompleted, "CALLER_INPUT_NOT_COPIED");
  check((await query(factory, "SELECT value='first' AS original FROM public.hra_migration_probe WHERE id=1")).rows[0].original === true, "CALLER_BYTES_EXECUTED");
});

test("중간 DDL 실패는 이전 prefix만 남기고 같은 bytes 재시도로 완료한다", async t => {
  const factory = await owned(t);
  check((await run(factory, sourceFor(migrationSql.slice(0, 1)))).manifestCompleted, "FIRST_PREFIX_FAILED");
  await query(factory, "UPDATE public.hra_migration_gate SET value=0");
  const before = factory.evidence().helperCalls, failed = await run(factory);
  check(failed.phase === "FAILED_PRECOMMIT" && failed.code === "MIGRATION_SQL_FAILED" && failed.firstErrorCode === "MIGRATION_SQL_FAILED", "DDL_FAILURE_STATE");
  check(await ledgerCount(factory) === 1 && (await query(factory, "SELECT to_regclass('public.hra_second_table') IS NULL AS absent")).rows[0].absent, "FAILED_DDL_COMMITTED");
  await query(factory, "UPDATE public.hra_migration_gate SET value=1");
  const resumed = await run(factory);
  check(resumed.manifestCompleted && factory.evidence().helperCalls === before + 3, "IMMUTABLE_RETRY_FAILED");
});

for (const [name, tail] of [
  ["deferred FK", "INSERT INTO public.hra_child VALUES(2,999)"],
  ["deferred trigger", "UPDATE public.hra_migration_probe SET value='blocked' WHERE id=2"],
]) test(`${name} COMMIT 거부는 해당 파일의 객체와 ledger를 모두 되돌린다`, async t => {
  const factory = await owned(t), source = sourceFor([migrationSql[0], `${migrationSql[1]} ${tail};`]);
  const result = await run(factory, source);
  check(result.code === "COMMIT_REJECTED" && result.phase === "FAILED_PRECOMMIT" && !result.phases.includes("COMMIT_OUTCOME_UNKNOWN"), "DEFERRED_REJECTION_UNKNOWN");
  check(await ledgerCount(factory) === 1 && (await query(factory, "SELECT to_regclass('public.hra_second_table') IS NULL AS absent")).rows[0].absent, "DEFERRED_PARTIAL_COMMIT");
});

for (const control of ["COMMIT", "ROLLBACK", "DO $body$ BEGIN COMMIT; END $body$"]) test(`서버 helper가 transaction 제어 ${control.startsWith("DO") ? "DO" : control}를 원자적으로 거부한다`, async t => {
  const factory = await owned(t), source = sourceFor([`CREATE TABLE public.hra_forbidden(id integer); ${control};`]);
  const result = await run(factory, source);
  check(result.phase === "FAILED_PRECOMMIT" && result.code === "MIGRATION_SQL_FAILED", "TRANSACTION_CONTROL_ACCEPTED");
  check(await ledgerCount(factory) === 0 && (await query(factory, "SELECT to_regclass('public.hra_forbidden') IS NULL AS absent")).rows[0].absent, "TRANSACTION_CONTROL_LEAK");
});

test("실제 ledger INSERT 거부도 migration DDL과 함께 rollback된다", async t => {
  const factory = await owned(t), reference = await owned(t), source = sourceFor(migrationSql.slice(0, 2));
  const setup = `CREATE FUNCTION hra_migrations.reject_second() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER AS $body$ BEGIN IF NEW.sequence=2 THEN RAISE EXCEPTION 'SYNTHETIC_LEDGER_REJECTED' USING ERRCODE='23514'; END IF; RETURN NEW; END $body$;
    CREATE TRIGGER reject_second BEFORE INSERT ON hra_migrations.applied_migrations FOR EACH ROW EXECUTE FUNCTION hra_migrations.reject_second();`;
  const ref = await ready(reference);
  let expected;
  try {
    await ref.query(localMigrationBootstrapSql); await ref.query(setup);
    const zero = await collectLocalCatalog(ref); await applyReference(ref, source, 1); const one = await collectLocalCatalog(ref);
    expected = [zero, one, (await contracts())[2]];
  } finally { await ref.close(); }
  await query(factory, localMigrationBootstrapSql); await query(factory, setup);
  const result = await runLocalMigrations({ factory, source, catalogContracts: expected });
  check(result.code === "LEDGER_INSERT_FAILED" && result.phase === "FAILED_PRECOMMIT", "LEDGER_INSERT_FAILURE_STATE");
  check(await ledgerCount(factory) === 1 && (await query(factory, "SELECT to_regclass('public.hra_second_table') IS NULL AS absent")).rows[0].absent, "LEDGER_INSERT_PARTIAL_COMMIT");
});

const driftMutations = [
  ["ledger-hash", "UPDATE hra_migrations.applied_migrations SET sha256=repeat('f',64) WHERE sequence=1", "LEDGER_PREFIX_MISMATCH"],
  ["ledger-hole", "DELETE FROM hra_migrations.applied_migrations WHERE sequence=1", "LEDGER_PREFIX_MISMATCH"],
  ["ledger-id", "UPDATE hra_migrations.applied_migrations SET id='changed-id' WHERE sequence=1", "LEDGER_PREFIX_MISMATCH"],
  ["ledger-sequence", "UPDATE hra_migrations.applied_migrations SET sequence=9 WHERE sequence=1", "LEDGER_PREFIX_MISMATCH"],
  ["ledger-extra", "INSERT INTO hra_migrations.applied_migrations VALUES('unknown',4,repeat('e',64),'applied')", "LEDGER_PREFIX_MISMATCH"],
  ["ledger-schema", "ALTER TABLE hra_migrations.applied_migrations ADD COLUMN extra text", "LEDGER_SHAPE_INVALID"],
  ["native-empty", "CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id integer)", "LEDGER_CONFLICT"],
  ["function-body", "CREATE OR REPLACE FUNCTION public.hra_probe_label(input integer) RETURNS text LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path=pg_catalog,public AS 'SELECT (input+1)::text'", "CATALOG_MISMATCH"],
  ["function-acl", "REVOKE EXECUTE ON FUNCTION public.hra_probe_label(integer) FROM PUBLIC", "CATALOG_MISMATCH"],
  ["function-security", "ALTER FUNCTION public.hra_probe_label(integer) SECURITY DEFINER", "CATALOG_MISMATCH"],
  ["function-config", "ALTER FUNCTION public.hra_probe_label(integer) SET search_path=public", "CATALOG_MISMATCH"],
  ["fk-deferred", "ALTER TABLE public.hra_child ALTER CONSTRAINT hra_child_parent_id_fkey NOT DEFERRABLE INITIALLY IMMEDIATE", "CATALOG_MISMATCH"],
  ["fk-action", "ALTER TABLE public.hra_child DROP CONSTRAINT hra_child_parent_id_fkey; ALTER TABLE public.hra_child ADD CONSTRAINT hra_child_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES public.hra_parent(id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED", "CATALOG_MISMATCH"],
  ["fk-validity", "ALTER TABLE public.hra_child DROP CONSTRAINT hra_child_parent_id_fkey; ALTER TABLE public.hra_child ADD CONSTRAINT hra_child_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES public.hra_parent(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED NOT VALID", "CATALOG_MISMATCH"],
  ["index", "DROP INDEX public.hra_probe_value_idx; CREATE INDEX hra_probe_value_idx ON public.hra_migration_probe(value DESC)", "CATALOG_MISMATCH"],
  ["index-invalid", async factory => {
    await query(factory, "DROP INDEX public.hra_probe_value_idx");
    await assert.rejects(query(factory, "CREATE UNIQUE INDEX CONCURRENTLY hra_probe_value_idx ON public.hra_migration_probe((true))"), error => error.code === "23505");
    check((await query(factory, "SELECT NOT indisvalid AS invalid FROM pg_catalog.pg_index WHERE indexrelid='public.hra_probe_value_idx'::regclass")).rows[0].invalid, "INVALID_INDEX_NOT_CREATED");
  }, "CATALOG_MISMATCH"],
  ["view", "CREATE OR REPLACE VIEW public.hra_probe_view AS SELECT id,value FROM public.hra_migration_probe WHERE id>1", "CATALOG_MISMATCH"],
  ["column-default", "ALTER TABLE public.hra_migration_probe ALTER COLUMN value SET DEFAULT 'drift'", "CATALOG_MISMATCH"],
  ["constraint", "ALTER TABLE public.hra_migration_probe ADD CONSTRAINT hra_probe_positive CHECK(id>0)", "CATALOG_MISMATCH"],
  ["schema-acl", "GRANT USAGE ON SCHEMA public TO PUBLIC", "CATALOG_MISMATCH"],
  ["trigger", "ALTER TABLE public.hra_migration_probe DISABLE TRIGGER hra_probe_guard", "CATALOG_MISMATCH"],
  ["policy", "ALTER POLICY hra_probe_read ON public.hra_migration_probe USING(false)", "CATALOG_MISMATCH"],
  ["probe-data", "UPDATE public.hra_migration_probe SET value='drift' WHERE id=1", "CATALOG_MISMATCH"],
];
for (const [name, mutation, expectedCode] of driftMutations) test(`ACK 재연결 전체교차검증 차단: ${name}`, async t => {
  const factory = await owned(t);
  factory.faults.dropCommitAckAt(2);
  factory.faults.beforeNextOpen(async () => {
    // 최초 open에서는 아직 fault를 재설정한다. 실제 변경은 wire ACK 유실 다음 open에서만 한다.
    factory.faults.beforeNextOpen(() => typeof mutation === "function" ? mutation(factory) : query(factory, mutation));
  });
  const result = await run(factory);
  check(result.phase === "BLOCKED" && result.code === expectedCode && result.firstErrorCode === "COMMIT_OUTCOME_UNKNOWN" && !result.manifestCompleted, "DRIFT_NOT_BLOCKED");
  check(factory.evidence().helperCalls === 2 && factory.evidence().droppedCommitAcks === 1, "DRIFT_SQL_REPLAYED");
});

test("ACK 재연결의 다른 소유 target은 읽기 identity 뒤 쓰기 전에 차단된다", async t => {
  const factory = await owned(t), other = await owned(t);
  factory.faults.dropCommitAckAt(1);
  factory.faults.beforeNextOpen(() => { factory.faults.beforeNextOpen(() => { factory.faults.nextOpenUses(other); }); });
  const result = await run(factory);
  check(result.code === "TARGET_MISMATCH" && result.firstErrorCode === "COMMIT_OUTCOME_UNKNOWN" && !result.manifestCompleted, "TARGET_SWAP_ACCEPTED");
  check(other.evidence().helperCalls === 0 && (await query(other, "SELECT to_regclass('hra_migrations.applied_migrations') IS NULL AS absent")).rows[0].absent, "FOREIGN_TARGET_WRITTEN");
});

for (const mode of ["read", "catalog"]) test(`정상 COMMIT 후 ${mode} 관측 실패는 committed BLOCKED로 유지한다`, async t => {
  const factory = await owned(t);
  if (mode === "read") factory.faults.failNextQuery(text => factory.evidence().commits >= 1 && text.includes("hra-catalog:schemas"));
  else factory.faults.beforeNextQuery(text => factory.evidence().commits >= 1 && text.includes("hra-catalog:schemas"), () => query(factory, "ALTER FUNCTION public.hra_probe_label(integer) SECURITY DEFINER"));
  const result = await run(factory);
  check(result.phase === "BLOCKED" && result.code === (mode === "read" ? "CATALOG_READ_FAILED" : "CATALOG_MISMATCH") && result.phases.includes("COMMITTED") && result.phases.includes("VERIFYING") && !result.phases.includes("COMMIT_OUTCOME_UNKNOWN") && !result.phases.includes("FAILED_PRECOMMIT"), "COMMITTED_FAILURE_MISCLASSIFIED");
  check(await ledgerCount(factory) === 1 && factory.evidence().helperCalls === 1, "COMMITTED_FAILURE_REPLAYED");
});

/** 실제 advisory lock 대기열이 만들어진 뒤 해제하여 stale pending 읽기를 검증한다. */
async function waitFor(predicate, code, milliseconds = 3000) {
  const deadline = Date.now() + milliseconds;
  while (!predicate() && Date.now() < deadline) await delay(10);
  check(predicate(), code);
}
for (const mode of ["same", "append", "conflicting-prefix"]) test(`실제 두 runner의 DB 전역 lock과 최신 prefix 재조회: ${mode}`, async t => {
  const factory = await owned(t), barrier = await ready(factory);
  await barrier.query("SELECT pg_advisory_lock($1::integer,$2::integer)", localMigrationLock);
  const firstSource = sourceFor(migrationSql.slice(0, 2)), secondSource = mode === "same" ? sourceFor(migrationSql.slice(0, 2)) : sourceFor();
  if (mode === "conflicting-prefix") secondSource.manifest.migrations[0].id = "conflicting-id";
  const initialLocks = factory.evidence().lockRequests;
  const first = run(factory, firstSource);
  await waitFor(() => factory.evidence().lockRequests >= initialLocks + 1, "FIRST_RUNNER_NOT_WAITING");
  const second = run(factory, secondSource);
  await waitFor(() => factory.evidence().lockRequests >= initialLocks + 2, "SECOND_RUNNER_NOT_WAITING");
  await barrier.query("SELECT pg_advisory_unlock($1::integer,$2::integer)", localMigrationLock); await barrier.close();
  const [one, two] = await Promise.all([first, second]);
  check(one.manifestCompleted, "FIRST_RUNNER_FAILED");
  if (mode === "conflicting-prefix") check(two.code === "LEDGER_PREFIX_MISMATCH" && factory.evidence().helperCalls === 2, "CONFLICTING_RUNNER_APPLIED");
  else check(two.manifestCompleted && factory.evidence().helperCalls === (mode === "append" ? 3 : 2), "CONCURRENT_SQL_REPLAYED");
});

test("실제 lock timeout은 SQL 적용0·한정시간 실패로 끝난다", async t => {
  const factory = await owned(t), barrier = await ready(factory);
  await barrier.query("SELECT pg_advisory_lock($1::integer,$2::integer)", localMigrationLock);
  try {
    const result = await run(factory, sourceFor(), { timeoutMs: 300 });
    check(result.code === "LOCK_TIMEOUT" && result.firstErrorCode === "LOCK_TIMEOUT" && factory.evidence().helperCalls === 0, "LOCK_TIMEOUT_APPLIED");
  } finally { await barrier.close(); }
});

test("ACK 복구 도중 다른 runner가 같은 manifest를 더 진행하면 전체 C[k]만 인정한다", async t => {
  const factory = await owned(t);
  factory.faults.dropCommitAckAt(1);
  factory.faults.beforeNextOpen(() => { factory.faults.beforeNextOpen(async () => { check((await run(factory)).manifestCompleted, "COMPETING_PROGRESS_FAILED"); }); });
  const result = await run(factory);
  check(result.manifestCompleted && result.applied === 3 && result.firstErrorCode === "COMMIT_OUTCOME_UNKNOWN" && factory.evidence().helperCalls === 3, "CONCURRENT_RECONCILE_REPLAYED");
});

test("자기 manifest 범위를 넘는 다른 runner 진척은 ACK 복구에서 차단한다", async t => {
  const factory = await owned(t);
  factory.faults.dropCommitAckAt(1);
  factory.faults.beforeNextOpen(() => { factory.faults.beforeNextOpen(async () => { check((await run(factory)).manifestCompleted, "COMPETING_APPEND_FAILED"); }); });
  const result = await run(factory, sourceFor(migrationSql.slice(0, 2)));
  check(result.code === "LEDGER_PREFIX_MISMATCH" && !result.manifestCompleted && factory.evidence().helperCalls === 3, "EXTRA_PREFIX_ACCEPTED");
});

test("실제 lock 상실과 session 설정 변경은 다음 migration 전에 차단한다", async t => {
  for (const mode of ["lock", "settings"]) {
    const factory = await owned(t);
    factory.faults.beforeNextQuery(text => text.includes("FROM hra_local_scope.identity") && factory.evidence().helperCalls >= 1,
      session => session.query(mode === "lock" ? "SELECT pg_advisory_unlock($1::integer,$2::integer)" : "SET search_path TO public", mode === "lock" ? localMigrationLock : []));
    const result = await run(factory);
    check(result.code === (mode === "lock" ? "LOCK_LOST" : "SESSION_SETTINGS_CHANGED") && result.phase === "FAILED_PRECOMMIT", "SESSION_DRIFT_ACCEPTED");
    check(await ledgerCount(factory) === 0, "SESSION_DRIFT_COMMITTED");
  }
});

test("최초 SQL 실패는 rollback·cleanup 실패로 덮어쓰지 않는다", async t => {
  const factory = await owned(t), bad = sourceFor(["SELECT 1/0"]);
  factory.faults.failNextQuery(text => /^ROLLBACK$/i.test(text)); factory.faults.failCleanupOnce();
  const result = await run(factory, bad);
  check(result.code === "MIGRATION_SQL_FAILED" && result.firstErrorCode === "MIGRATION_SQL_FAILED" && !result.cleanupComplete && result.cleanupCodes.includes("ROLLBACK_FAILED") && result.cleanupCodes.includes("SESSION_CLEANUP_FAILED"), "PRIMARY_ERROR_REPLACED");
  check(factory.evidence().activeSockets === 0 && await ledgerCount(factory) === 0, "CLEANUP_FAULT_LEFT_SQL");
});

test("최소 권한 누락과 권한 상승 시도는 migration 실행 전에 거부된다", async t => {
  for (const privilege of ["temporary", "public-create"]) {
    const factory = await owned(t);
    factory.faults.revokePrivilege(privilege);
    const result = await run(factory);
    check(result.code === "ROLE_INVALID" && factory.evidence().helperCalls === 0, "MISSING_PRIVILEGE_ACCEPTED");
    await assert.rejects(query(factory, "ALTER ROLE hra_migration_operator SUPERUSER"), error => error.code === "42501");
  }
});

test("startup 성공 ACK가 유실돼도 소유 postmaster를 먼저 중지한 뒤 root를 제거한다", async t => {
  const root = await mkdtemp(join(tmpdir(), "hra-migration-startup-")), marker = join(root, "started.json");
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const name of ["initdb", "createdb", "psql"]) await symlink(join(postgresBin, name), join(root, name));
  const wrapper = join(root, "pg_ctl");
  await writeFile(wrapper, `#!${process.execPath}\nconst{spawnSync}=require('node:child_process');const{writeFileSync,readFileSync}=require('node:fs');const args=process.argv.slice(2);const result=spawnSync(${JSON.stringify(join(postgresBin, "pg_ctl"))},args,{stdio:'ignore'});if(args.includes('start')&&result.status===0){writeFileSync(${JSON.stringify(marker)},JSON.stringify({data:args[args.indexOf('-D')+1],pid:parseInt(readFileSync(args[args.indexOf('-D')+1]+'/postmaster.pid','utf8').split(String.fromCharCode(10))[0],10)}));process.exit(1)}process.exit(result.status??1);\n`);
  await chmod(wrapper, 0o700);
  let failure;
  try { createOwnedLocalFactory({ postgresBin: root }); } catch (error) { failure = error; }
  const metadata = JSON.parse(await readFile(marker, "utf8"));
  const postmasterAlive = async () => {
    try { return !/\)\s+Z\s/.test(await readFile(`/proc/${metadata.pid}/stat`, "utf8")); }
    catch (error) { if (error.code === "ENOENT") return false; throw error; }
  };
  try {
    check(failure?.message === "LOCAL_PG_PROVISION_FAILED" && failure.cleanupComplete === true && failure.cleanupCode === null && !existsSync(metadata.data) && !(await postmasterAlive()), "STARTUP_ACK_ORPHANED_SERVER");
  } finally {
    // 구버전 회귀가 살아 있는 daemon을 남기더라도 이 wrapper가 기록한 소유 PID만 중지한다.
    if (await postmasterAlive()) {
      process.kill(metadata.pid, "SIGQUIT");
      const until = Date.now() + 3000;
      while (await postmasterAlive() && Date.now() < until) await delay(10);
      check(!(await postmasterAlive()), "STARTUP_FAULT_FALLBACK_FAILED");
    }
  }
});

for (const mode of ["existing", "definition"]) test(`임시 helper ${mode} 충돌은 SQL 실행 전에 거부된다`, async t => {
  const factory = await owned(t);
  if (mode === "existing") factory.faults.beforeNextQuery(text => text.includes("AS count") && text.includes("proname='hra_apply_migration'"), session => session.query("CREATE FUNCTION pg_temp.hra_apply_migration(text) RETURNS void LANGUAGE plpgsql AS 'BEGIN RETURN; END'"));
  else factory.faults.beforeNextQuery(text => text.includes("p.prosrc AS body"), session => session.query("ALTER FUNCTION pg_temp.hra_apply_migration(text) SECURITY DEFINER"));
  const result = await run(factory);
  check(result.code === (mode === "existing" ? "HELPER_CONFLICT" : "HELPER_INVALID") && factory.evidence().helperCalls === 0 && await ledgerCount(factory) === 0, "HELPER_TAMPER_EXECUTED");
});

test("transaction 밖 index 작업은 helper에서 실패하고 prefix를 보존한다", async t => {
  const factory = await owned(t);
  const source = sourceFor([migrationSql[0], "CREATE INDEX CONCURRENTLY unsupported_idx ON public.hra_migration_probe(value)"]);
  const result = await run(factory, source);
  check(result.code === "MIGRATION_SQL_FAILED" && result.phase === "FAILED_PRECOMMIT" && await ledgerCount(factory) === 1, "NONTRANSACTIONAL_SQL_ACCEPTED");
});

test("COMMIT 전 연결 유실은 폐기하며 원자 적용을 자동 재실행하지 않는다", async t => {
  const factory = await owned(t);
  factory.faults.beforeNextQuery(text => text.includes("FROM hra_local_scope.identity") && factory.evidence().helperCalls === 1, session => session.destroy());
  const result = await run(factory);
  check(!result.manifestCompleted && factory.evidence().helperCalls === 1 && await ledgerCount(factory) === 0, "PRECOMMIT_LOSS_REPLAYED");
});

test("잘못된 provider의 다른 실제 세션 identity 라우팅을 BACKEND_CHANGED로 차단한다", async t => {
  const factory = await owned(t);
  factory.faults.displaceIdentityAfterNextHelper();
  const result = await run(factory);
  check(result.code === "BACKEND_CHANGED" && result.phase === "FAILED_PRECOMMIT" && factory.evidence().helperCalls === 1, "ROUTED_IDENTITY_ACCEPTED");
  check(await ledgerCount(factory) === 0 && (await query(factory, "SELECT to_regclass('public.hra_migration_probe') IS NULL AS absent")).rows[0].absent, "ROUTED_IDENTITY_PARTIAL_COMMIT");
});

test("nonsuperuser의 내부 FK trigger 변경은 거부하고 고정 QA fault 뒤 reconcile은 차단한다", async t => {
  const factory = await owned(t);
  check((await run(factory, sourceFor(migrationSql.slice(0, 1)))).manifestCompleted, "INTERNAL_TRIGGER_PREFIX_FAILED");
  await assert.rejects(query(factory, "ALTER TABLE public.hra_child DISABLE TRIGGER ALL"), error => error.code === "42501");
  factory.faults.dropCommitAckAt(1);
  factory.faults.beforeNextOpen(() => { factory.faults.beforeNextOpen(() => factory.faults.disableInternalFixtureTrigger()); });
  const result = await run(factory);
  check(result.code === "CATALOG_MISMATCH" && result.firstErrorCode === "COMMIT_OUTCOME_UNKNOWN" && factory.evidence().privilegedFixtureFaults === 1 && factory.evidence().helperCalls === 2, "INTERNAL_TRIGGER_DRIFT_ACCEPTED");
});

test("다른 OID와 FK 생성 순서도 같은 catalog 의미로 정규화한다", async t => {
  const factory = await owned(t), reference = await owned(t), source = sourceFor(migrationSql.slice(0, 1));
  const ref = await ready(reference);
  let expected, originalNames;
  try {
    await ref.query(localMigrationBootstrapSql); const zero = await collectLocalCatalog(ref);
    await applyReference(ref, source, 1); const one = await collectLocalCatalog(ref); expected = [zero, one];
    originalNames = (await ref.query("SELECT array_agg(tgname ORDER BY tgname) AS names FROM pg_catalog.pg_trigger WHERE tgrelid='public.hra_child'::regclass AND tgisinternal")).rows[0].names;
  } finally { await ref.close(); }
  await query(factory, "CREATE TABLE public.oid_burn(id integer); DROP TABLE public.oid_burn");
  const alternate = migrationSql[0].replace(
    "CREATE TABLE public.hra_parent(id integer PRIMARY KEY);\n   CREATE TABLE public.hra_child(id integer PRIMARY KEY,parent_id integer REFERENCES public.hra_parent(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED);",
    "CREATE TABLE public.hra_child(id integer PRIMARY KEY,parent_id integer); CREATE TABLE public.hra_parent(id integer PRIMARY KEY); ALTER TABLE public.hra_child ADD CONSTRAINT hra_child_parent_id_fkey FOREIGN KEY(parent_id) REFERENCES public.hra_parent(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED;",
  );
  check(alternate !== migrationSql[0], "OID_FIXTURE_NOT_CHANGED");
  const result = await runLocalMigrations({ factory, source: sourceFor([alternate]), catalogContracts: expected });
  check(result.manifestCompleted, "SEMANTIC_CATALOG_CHANGED");
  const changedNames = (await query(factory, "SELECT array_agg(tgname ORDER BY tgname) AS names FROM pg_catalog.pg_trigger WHERE tgrelid='public.hra_child'::regclass AND tgisinternal")).rows[0].names;
  check(JSON.stringify(originalNames) !== JSON.stringify(changedNames), "INTERNAL_TRIGGER_OIDS_NOT_CHANGED");
  check(result.catalogDigest === expected[1].digest, "OID_NORMALIZATION_DRIFT");
});

test("SIGTERM 중 실제 helper 실행도 child의 소유 PG/socket을 정리한다", { timeout: 30000 }, async () => {
  const childFile = fileURLToPath(new URL("../support/db-migration-signal-child.mjs", import.meta.url));
  const child = spawn(process.execPath, [childFile, postgresBin], { stdio: ["ignore", "pipe", "pipe"], env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP, SYSTEMROOT: process.env.SYSTEMROOT } });
  let buffer = "", rawDiagnostics = 0, final, signaled = false;
  child.stdout.on("data", chunk => {
    buffer += chunk.toString("utf8");
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const event = JSON.parse(line);
        if (event.ready === true && !signaled) { signaled = true; setTimeout(() => child.kill("SIGTERM"), 50); }
        else final = event;
      } catch { rawDiagnostics++; }
    }
  });
  child.stderr.on("data", chunk => { rawDiagnostics += chunk.length; });
  const finished = new Promise(resolve => child.once("exit", code => resolve(code)));
  let timer;
  try {
    const code = await Promise.race([finished, new Promise(resolve => { timer = setTimeout(() => { child.kill("SIGKILL"); resolve(-1); }, 20000); })]);
    check(code === 0 && signaled && final?.completed && final.cleanupComplete && final.clusterRemoved && final.activeSockets === 0 && final.configurationRestored && rawDiagnostics === 0, "SIGNAL_CHILD_CLEANUP_FAILED");
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null && child.signalCode === null) { child.kill("SIGKILL"); await finished; }
    // 실패/강제 종료 때도 이 child PID의 private marker와 일치하는 root만 정리한다.
    for (const name of (await readdir("/dev/shm")).filter(name => name.startsWith("hra-migration-local-"))) {
      const root = join("/dev/shm", name);
      let owner;
      try { owner = JSON.parse(await readFile(join(root, "owner.json"), "utf8")); } catch { continue; }
      if (owner.processId !== child.pid || owner.scope !== "hra-migration-local") continue;
      const data = join(root, "data");
      const stop = spawnSync(join(postgresBin, "pg_ctl"), ["-D", data, "-m", "immediate", "-w", "-t", "5", "stop"], { timeout: 8000, stdio: "ignore" });
      const status = spawnSync(join(postgresBin, "pg_ctl"), ["-D", data, "status"], { timeout: 3000, stdio: "ignore" });
      if (status.status === 3 && !status.error) await rm(root, { recursive: true, force: true });
      else check(stop.status === 0 && !status.error && status.status !== 0, "SIGNAL_FALLBACK_CLEANUP_FAILED");
    }
  }
});

test("다른 factory open 내부에서 늦어진 fault 세션도 닫는 factory가 추적·폐기한다", async t => {
  const owner = await owned(t), target = await owned(t);
  target.faults.beforeNextOpen(() => delay(150));
  owner.faults.nextOpenUses(target);
  const opening = owner.open();
  const rejected = opening.then(() => false, () => true);
  await delay(30); await owner.close();
  check(await rejected, "FOREIGN_LATE_OPEN_ACCEPTED");
  const evidence = target.evidence();
  check(owner.evidence().cleanupComplete && evidence.openedSockets === 1 && evidence.closedSockets === 1 && evidence.activeSessions === 0 && evidence.activeSockets === 0, "FOREIGN_LATE_SESSION_LEAKED");
});
