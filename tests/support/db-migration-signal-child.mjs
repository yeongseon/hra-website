/** SIGTERM 중 실제 helper 실행을 중단하고 소유 PG·socket 정리를 보고하는 전용 child다. */
import { createHash } from "node:crypto";
import { createOwnedLocalFactory } from "./db-migration-local-adapter.mjs";
import { collectLocalCatalog } from "./db-migration-catalog.mjs";
import { runLocalMigrations, localMigrationBootstrapSql } from "../../scripts/_lib/db-migration-local-engine.mjs";

const postgresBin = process.argv[2];
const controller = new AbortController();
const interrupt = () => controller.abort();
process.once("SIGTERM", interrupt); process.once("SIGINT", interrupt);
let actual, reference;
try {
  const ddl = "CREATE TABLE public.hra_migration_probe(id integer,value text)";
  const sql = `${ddl}; SELECT pg_sleep(30)`;
  const sha256 = createHash("sha256").update(sql).digest("hex");
  reference = createOwnedLocalFactory({ postgresBin });
  const session = await reference.open();
  let catalogContracts;
  try {
    await session.query("SET search_path TO pg_catalog,public");
    await session.query(localMigrationBootstrapSql);
    const zero = await collectLocalCatalog(session);
    // 기다림은 durable catalog를 바꾸지 않으므로 reference에서는 고정 DDL만 준비한다.
    await session.query(ddl);
    await session.query("INSERT INTO hra_migrations.applied_migrations VALUES('signal',1,$1,'applied')", [sha256]);
    catalogContracts = [zero, await collectLocalCatalog(session)];
  } finally { await session.close(); await reference.close(); }
  actual = createOwnedLocalFactory({ postgresBin, signal: controller.signal });
  actual.faults.beforeNextQuery(text => /^SELECT pg_temp\.hra_apply_migration/.test(text), () => { console.log(JSON.stringify({ ready: true })); });
  const path = "scripts/db/versioned/signal.sql";
  const source = { manifest: { schemaVersion: 1, state: "configured", executionContract: "postgresql-file-transaction-v1",
    migrations: [{ id: "signal", sequence: 1, path, sha256, transaction: "required" }] },
    fileContents: { [path]: Buffer.from(sql) }, trackedSqlPaths: [path], untrackedSqlPaths: [], symlinkPaths: [] };
  const result = await runLocalMigrations({ factory: actual, source, catalogContracts, signal: controller.signal });
  await actual.close();
  const evidence = actual.evidence();
  const passed = result.code === "INTERRUPTED" && !result.manifestCompleted && evidence.cleanupComplete && evidence.clusterRemoved && evidence.activeSockets === 0;
  console.log(JSON.stringify({ completed: passed, code: result.code, cleanupComplete: evidence.cleanupComplete,
    clusterRemoved: evidence.clusterRemoved, activeSockets: evidence.activeSockets, configurationRestored: evidence.configurationRestored }));
  if (!passed) process.exitCode = 1;
} catch {
  console.log(JSON.stringify({ completed: false, code: "LOCAL_SIGNAL_CHILD_FAILED" })); process.exitCode = 1;
} finally {
  for (const factory of [actual, reference]) { if (factory) { try { await factory.close(); } catch { process.exitCode = 1; } } }
  process.removeListener("SIGTERM", interrupt); process.removeListener("SIGINT", interrupt);
}
