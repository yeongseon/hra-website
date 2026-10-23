/**
 * 소유 일회성 Unix PostgreSQL에만 연결하는 S2 테스트 전용 Neon adapter다.
 * 임의 URL·환경 자격정보·외부 factory 등록을 지원하지 않으며 hosted Neon 검증이 아니다.
 */
import net from "node:net";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { Pool, neonConfig } from "@neondatabase/serverless";

const ownedFactories = new WeakSet();
const stateByFactory = new WeakMap();
let connectionQueue = Promise.resolve();
const configurationKeys = ["webSocketConstructor", "wsProxy", "useSecureWebSocket", "forceDisablePgSSL", "pipelineConnect", "coalesceWrites", "poolQueryViaFetch", "fetchFunction"];
const check = (value, code) => { if (!value) throw new Error(code); };
const bounded = async (promise, milliseconds, code) => {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(code)), milliseconds); })]); }
  finally { clearTimeout(timer); }
};

/** 외부에 등록 API를 제공하지 않고 실제 로컬 생성기의 capability만 인정한다. */
export function assertOwnedLocalFactory(factory) {
  check(ownedFactories.has(factory) && !stateByFactory.get(factory)?.closed && !stateByFactory.get(factory)?.closing && stateByFactory.get(factory)?.scopeAlive(), "LOCAL_FACTORY_NOT_OWNED");
}

/** 소유 클러스터를 만들고 권한·marker만 준비한다. migration 검증에는 superuser를 쓰지 않는다. */
function createCluster(postgresBin) {
  check(typeof postgresBin === "string" && resolve(postgresBin) === postgresBin && existsSync(join(postgresBin, "pg_ctl")), "LOCAL_PG_BIN_REQUIRED");
  check(existsSync("/dev/shm"), "LOCAL_RAM_DIRECTORY_REQUIRED");
  const root = realpathSync(mkdtempSync("/dev/shm/hra-migration-local-"));
  const environment = { LC_ALL: "C", PGHOST: root, PGPORT: "55487", PGUSER: "hra_local_provisioner", PGDATABASE: "hra_migration_local", PGSSLMODE: "disable", PGCONNECT_TIMEOUT: "5", PGPASSWORD: "" };
  let startAttempted = false, closed = false;
  const invoke = (program, args, input) => {
    const result = spawnSync(join(postgresBin, program), args, { env: environment, input, encoding: "utf8", timeout: 30000, maxBuffer: 1024 * 1024 });
    check(result.status === 0 && !result.error, "LOCAL_PG_COMMAND_FAILED");
    return result.stdout.trim();
  };
  const sql = statement => invoke("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], statement);
  const serverStatus = () => {
    const result = spawnSync(join(postgresBin, "pg_ctl"), ["-D", join(root, "data"), "status"], { env: environment, encoding: "utf8", timeout: 3000, maxBuffer: 65536 });
    if (result.error || ![0, 3].includes(result.status)) throw new Error("LOCAL_PG_STATUS_UNKNOWN");
    return result.status === 0;
  };
  const close = () => {
    if (closed) return;
    if (startAttempted) {
      // 시작 ACK가 유실돼도 실제 daemon 상태부터 확인하며, 소멸을 확인하기 전 root를 지우지 않는다.
      if (serverStatus()) {
        const result = spawnSync(join(postgresBin, "pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "-t", "5", "stop"], { env: environment, timeout: 8000, stdio: "ignore" });
        check(result.status === 0 && !result.error, "LOCAL_PG_STOP_FAILED");
      }
      check(serverStatus() === false, "LOCAL_PG_STILL_RUNNING");
    }
    rmSync(root, { recursive: true, force: true }); closed = true;
  };
  try {
    writeFileSync(join(root, "owner.json"), JSON.stringify({ processId: process.pid, scope: "hra-migration-local" }), { mode: 0o600 });
    invoke("initdb", ["-D", join(root, "data"), "-A", "trust", "-U", environment.PGUSER, "--no-locale", "-E", "UTF8"]);
    startAttempted = true;
    invoke("pg_ctl", ["-D", join(root, "data"), "-l", join(root, "server.log"), "-o", `-h '' -k ${root} -p 55487 -c log_min_error_statement=panic -c log_min_messages=panic`, "-w", "start"]);
    invoke("createdb", [environment.PGDATABASE]);
    const systemId = sql("SELECT system_identifier FROM pg_control_system()");
    const databaseOid = sql("SELECT oid FROM pg_database WHERE datname=current_database()");
    const databaseId = createHash("sha256").update(`${systemId}:${databaseOid}`).digest("hex");
    const scopeId = randomUUID();
    sql(`CREATE ROLE hra_migration_operator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
      REVOKE ALL ON DATABASE hra_migration_local FROM PUBLIC;
      GRANT CONNECT,CREATE,TEMPORARY ON DATABASE hra_migration_local TO hra_migration_operator;
      REVOKE ALL ON SCHEMA public FROM PUBLIC;
      ALTER SCHEMA public OWNER TO hra_migration_operator;
      CREATE SCHEMA hra_local_scope;
      CREATE TABLE hra_local_scope.identity(database_id text NOT NULL,scope_id text NOT NULL,database_oid oid NOT NULL);
      INSERT INTO hra_local_scope.identity VALUES('${databaseId}','${scopeId}',${databaseOid});
      GRANT USAGE ON SCHEMA hra_local_scope TO hra_migration_operator;
      GRANT SELECT ON hra_local_scope.identity TO hra_migration_operator;`);
    writeFileSync(join(root, "owner.json"), JSON.stringify({ processId: process.pid, scope: "hra-migration-local", scopeId, databaseId }), { mode: 0o600 });
    const scopeAlive = () => { try { const owner = JSON.parse(readFileSync(join(root, "owner.json"), "utf8")); return owner.processId === process.pid && owner.scopeId === scopeId && owner.databaseId === databaseId; } catch { return false; } };
    const revokePrivilege = privilege => {
      check(["temporary", "public-create"].includes(privilege), "LOCAL_FAULT_INVALID");
      sql(privilege === "temporary" ? "REVOKE TEMPORARY ON DATABASE hra_migration_local FROM hra_migration_operator" : "REVOKE CREATE ON SCHEMA public FROM hra_migration_operator");
    };
    const disableInternalFixtureTrigger = () => sql(`DO $fault$ DECLARE trigger_name text; BEGIN
      SELECT t.tgname INTO trigger_name FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_constraint c ON c.oid=t.tgconstraint
      WHERE t.tgrelid='public.hra_child'::regclass AND t.tgisinternal AND c.conname='hra_child_parent_id_fkey' ORDER BY t.tgname LIMIT 1;
      IF trigger_name IS NULL THEN RAISE EXCEPTION 'LOCAL_FIXED_FIXTURE_MISSING'; END IF;
      EXECUTE pg_catalog.format('ALTER TABLE public.hra_child DISABLE TRIGGER %I',trigger_name);
    END $fault$`);
    return { root, scopeAlive, revokePrivilege, disableInternalFixtureTrigger, socketPath: join(root, ".s.PGSQL.55487"), expectedIdentity: Object.freeze({ databaseId, scopeId }), close };
  } catch {
    let cleanupComplete = true;
    try { close(); } catch { cleanupComplete = false; }
    const error = new Error("LOCAL_PG_PROVISION_FAILED");
    error.cleanupComplete = cleanupComplete; error.cleanupCode = cleanupComplete ? null : "LOCAL_PG_PROVISION_CLEANUP_FAILED";
    throw error;
  }
}

/** 연결 시작 구간만 SDK 설정을 변경하고 병렬 factory 사이에도 직렬화·원상복구한다. */
async function connectWithConfiguration(settings, connect, state) {
  const previous = connectionQueue;
  let release;
  connectionQueue = new Promise(resolve => { release = resolve; });
  await previous;
  const saved = Object.fromEntries(configurationKeys.map(key => [key, neonConfig[key]]));
  const originalFetch = globalThis.fetch;
  try {
    check(!state.closing && !state.closed, "LOCAL_ABORTED");
    for (const [key, value] of Object.entries(settings)) neonConfig[key] = value;
    globalThis.fetch = () => { state.deniedNetwork++; throw new Error("LOCAL_HTTP_DISABLED"); };
    return await connect();
  } finally {
    for (const key of configurationKeys) neonConfig[key] = saved[key];
    globalThis.fetch = originalFetch;
    state.configurationRestored = configurationKeys.every(key => neonConfig[key] === saved[key]) && globalThis.fetch === originalFetch;
    release();
  }
}

/** 성공 COMMIT 프레임만 실제 wire에서 버리고 SDK에 전달하기 전에 연결을 끊는다. */
function webSocketConstructor(cluster, state, ownedSockets) {
  return class OwnedUnixWebSocket extends EventTarget {
    constructor(url) {
      super();
      check(!state.closed && url === "ws://owned-local.invalid/direct", "LOCAL_NETWORK_DENIED");
      this.readyState = 0;
      this.pending = Buffer.alloc(0);
      this.socket = net.createConnection({ path: cluster.socketPath });
      state.sockets.add(this.socket); ownedSockets.add(this.socket);
      state.openedSockets++;
      this.socket.on("connect", () => { this.readyState = 1; this.dispatchEvent(new Event("open")); });
      this.socket.on("data", bytes => {
        this.pending = Buffer.concat([this.pending, bytes]);
        while (this.pending.length >= 5) {
          const size = this.pending.readInt32BE(1) + 1;
          if (size < 5 || size > 16 * 1024 * 1024) { this.socket.destroy(); return; }
          if (this.pending.length < size) break;
          const frame = this.pending.subarray(0, size);
          this.pending = this.pending.subarray(size);
          if (frame[0] === 67 && frame.subarray(5).equals(Buffer.from("COMMIT\0"))) {
            state.commits++;
            if (state.dropCommit === state.commits) {
              state.dropCommit = null; state.droppedCommitAcks++; this.socket.destroy(); return;
            }
          }
          this.dispatchEvent(new MessageEvent("message", { data: frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength) }));
        }
      });
      this.socket.on("error", () => { state.socketErrors++; this.dispatchEvent(new Event("error")); });
      this.socket.on("close", () => { this.readyState = 3; state.sockets.delete(this.socket); state.closedSockets++; this.dispatchEvent(new Event("close")); });
    }
    send(bytes) { this.socket.write(Buffer.from(bytes)); }
    close() { this.readyState = 2; this.socket.end(); }
  };
}

/** 임의 URL 없이 이 호출에서 만든 RAM DB와 marker만 소유한다. */
export function createOwnedLocalFactory(options = {}) {
  check(options && typeof options === "object" && !Array.isArray(options) && Object.keys(options).every(key => ["postgresBin", "signal"].includes(key)), "LOCAL_FACTORY_OPTIONS_INVALID");
  const { postgresBin, signal } = options;
  check(signal === undefined || signal instanceof AbortSignal, "LOCAL_FACTORY_OPTIONS_INVALID");
  const cluster = createCluster(postgresBin);
  const state = { closed: false, closing: false, scopeAlive: cluster.scopeAlive, pendingOpens: new Set(), sessions: new Set(), sockets: new Set(), openedSockets: 0, closedSockets: 0,
    clientErrors: 0, endEvents: 0, releases: 0, poolEnds: 0, socketErrors: 0, deniedNetwork: 0,
    displacedIdentityAt: null, privilegedFixtureFaults: 0, helperCalls: 0, lockRequests: 0, commits: 0, dropCommit: null, droppedCommitAcks: 0, configurationRestored: true, cleanupComplete: false,
    beforeOpen: null, nextTarget: null, queryFault: null, queryHook: null, cleanupFault: null };
  let closing;
  const evidence = () => ({ closed: state.closed, openedSockets: state.openedSockets, closedSockets: state.closedSockets,
    activeSockets: state.sockets.size, activeSessions: state.sessions.size, releases: state.releases, poolEnds: state.poolEnds,
    privilegedFixtureFaults: state.privilegedFixtureFaults, helperCalls: state.helperCalls, lockRequests: state.lockRequests, clientErrors: state.clientErrors, endEvents: state.endEvents, commits: state.commits, droppedCommitAcks: state.droppedCommitAcks,
    deniedNetwork: state.deniedNetwork, configurationRestored: state.configurationRestored, cleanupComplete: state.cleanupComplete,
    clusterRemoved: !existsSync(cluster.root) });
  const factory = {
    expectedIdentity: cluster.expectedIdentity,
    evidence,
    /** 원본 client를 노출하지 않고 성공·실패에 같은 유한 close 경로를 사용한다. */
    async open() {
      assertOwnedLocalFactory(factory);
      check(!signal?.aborted, "LOCAL_ABORTED");
      // hook·다른 소유 target을 포함한 open 전체 수명을 시작 즉시 추적한다.
      const openToken = {}; state.pendingOpens.add(openToken);
      try {
        if (state.beforeOpen) {
          const hook = state.beforeOpen; state.beforeOpen = null;
          await bounded(Promise.resolve().then(hook), 3000, "LOCAL_OPEN_HOOK_TIMEOUT");
        }
        check(!state.closing && !state.closed && !signal?.aborted, "LOCAL_ABORTED");
        if (state.nextTarget) {
          const target = state.nextTarget; state.nextTarget = null;
          const foreign = await target.open();
          let leaseClosing;
          const finishLease = destroy => {
            if (!leaseClosing) leaseClosing = (async () => {
              try { await (destroy ? foreign.destroy() : foreign.close()); }
              finally { state.sessions.delete(lease); }
            })();
            return leaseClosing;
          };
          const lease = Object.freeze({ query: foreign.query, identity: foreign.identity,
            close: () => finishLease(false), destroy: () => finishLease(true) });
          state.sessions.add(lease);
          if (state.closing || state.closed || signal?.aborted) { await lease.destroy(); throw new Error("LOCAL_ABORTED"); }
          return lease;
        }
        const pool = new Pool({ host: "owned-local.invalid", port: 55487, user: "hra_migration_operator", database: "hra_migration_local", password: "local-only", ssl: false, max: 1, connectionTimeoutMillis: 3000, idleTimeoutMillis: 1000 });
        pool.on("error", () => { state.clientErrors++; });
        let client, broken = false, closed = false, closePromise;
        const ownSockets = new Set();
        try {
          client = await connectWithConfiguration({ webSocketConstructor: webSocketConstructor(cluster, state, ownSockets),
            wsProxy: (host, port) => { check(host === "owned-local.invalid" && port === 55487, "LOCAL_NETWORK_DENIED"); return "owned-local.invalid/direct"; },
            useSecureWebSocket: false, forceDisablePgSSL: true, pipelineConnect: false, coalesceWrites: false,
            poolQueryViaFetch: false, fetchFunction: () => { state.deniedNetwork++; throw new Error("LOCAL_HTTP_DISABLED"); } }, () => pool.connect(), state);
        } catch {
          for (const socket of ownSockets) socket.destroy();
          await bounded(pool.end(), 3000, "LOCAL_POOL_END_FAILED");
          throw new Error("LOCAL_CONNECT_FAILED");
        }
        client.on("error", () => { broken = true; state.clientErrors++; });
        client.on("end", () => { broken = true; state.endEvents++; });
        const session = {
          async query(text, values = []) {
            check(!closed && !broken && !signal?.aborted, "LOCAL_SESSION_CLOSED");
            if (/pg_advisory_lock/.test(text)) state.lockRequests++;
            if (/^\s*SELECT\s+pg_temp\.hra_apply_migration\(/i.test(text)) state.helperCalls++;
            if (state.queryHook?.predicate(text)) { const fault = state.queryHook; state.queryHook = null; await bounded(Promise.resolve().then(() => fault.hook(session)), 3000, "LOCAL_QUERY_HOOK_TIMEOUT"); }
            check(!closed && !broken && !signal?.aborted && !state.closing, "LOCAL_SESSION_CLOSED");
            if (state.queryFault?.(text)) { state.queryFault = null; const error = new Error("LOCAL_QUERY_FAILED"); error.code = "LOCAL_INJECTED_QUERY_ERROR"; throw error; }
            try { return await client.query(text, values); }
            catch (error) { const safe = new Error("LOCAL_QUERY_FAILED"); safe.code = /^[0-9A-Z]{5}$/.test(error?.code ?? "") ? error.code : "LOCAL_TRANSPORT_ERROR"; throw safe; }
          },
          async identity() {
            if (state.displacedIdentityAt !== null && state.helperCalls >= state.displacedIdentityAt) {
              state.displacedIdentityAt = null;
              // test-only: 잘못된 provider가 같은 target의 다른 실제 세션 관측을 라우팅하는 모형이다.
              const other = await factory.open();
              try { return await other.identity(); } finally { await other.close(); }
            }
            const result = await session.query(`SELECT s.database_id,s.scope_id,pg_catalog.pg_backend_pid() AS backend_id,
              current_user AS role,r.rolsuper,s.database_oid=(SELECT oid FROM pg_catalog.pg_database WHERE datname=current_database()) AS database_matches
              FROM hra_local_scope.identity s JOIN pg_catalog.pg_roles r ON r.rolname=current_user`);
            const row = result.rows[0];
            check(result.rows.length === 1 && row.role === "hra_migration_operator" && row.rolsuper === false && row.database_matches === true, "LOCAL_IDENTITY_INVALID");
            return { databaseId: row.database_id, scopeId: row.scope_id, backendId: row.backend_id };
          },
          close() {
            if (closePromise) return closePromise;
            closed = true;
            closePromise = (async () => {
              let cleanupError = false;
              try { state.releases++; client.release(true); } catch { cleanupError = true; }
              try { state.poolEnds++; await bounded(pool.end(), 3000, "LOCAL_POOL_END_FAILED"); } catch { cleanupError = true; }
              for (const socket of ownSockets) if (!socket.destroyed) socket.destroy();
              const until = Date.now() + 3000;
              while ([...ownSockets].some(socket => state.sockets.has(socket)) && Date.now() < until) await delay(10);
              if ([...ownSockets].some(socket => state.sockets.has(socket))) cleanupError = true;
              state.sessions.delete(session);
              if (state.cleanupFault) { state.cleanupFault = null; cleanupError = true; }
              check(!cleanupError, "LOCAL_SESSION_CLEANUP_FAILED");
            })();
            return closePromise;
          },
          destroy() { broken = true; for (const socket of ownSockets) socket.destroy(); return session.close(); },
        };
        Object.freeze(session);
        state.sessions.add(session);
        if (state.closing || state.closed || signal?.aborted) { await session.destroy(); throw new Error("LOCAL_ABORTED"); }
        return session;
      } finally { state.pendingOpens.delete(openToken); }
    },
    /** test-only fault도 소유 로컬 DB 외의 연결 대상을 허용하지 않는다. */
    faults: Object.freeze({
      dropCommitAckAt(number) { check(Number.isSafeInteger(number) && number > 0, "LOCAL_FAULT_INVALID"); state.dropCommit = state.commits + number; },
      beforeNextOpen(hook) { check(typeof hook === "function", "LOCAL_FAULT_INVALID"); state.beforeOpen = hook; },
      nextOpenUses(other) { assertOwnedLocalFactory(other); check(other !== factory, "LOCAL_FAULT_INVALID"); state.nextTarget = other; },
      failNextQuery(predicate) { check(typeof predicate === "function", "LOCAL_FAULT_INVALID"); state.queryFault = predicate; },
      beforeNextQuery(predicate, hook) { check(typeof predicate === "function" && typeof hook === "function", "LOCAL_FAULT_INVALID"); state.queryHook = { predicate, hook }; },
      displaceIdentityAfterNextHelper() { state.displacedIdentityAt = state.helperCalls + 1; },
      disableInternalFixtureTrigger() { assertOwnedLocalFactory(factory); cluster.disableInternalFixtureTrigger(); state.privilegedFixtureFaults++; },
      revokePrivilege(privilege) { assertOwnedLocalFactory(factory); cluster.revokePrivilege(privilege); },
      failCleanupOnce() { state.cleanupFault = true; },
    }),
    close() {
      if (closing) return closing;
      state.closing = true;
      closing = (async () => {
        let failed = false;
        for (const socket of state.sockets) socket.destroy();
        const openDeadline = Date.now() + 4000;
        while (state.pendingOpens.size && Date.now() < openDeadline) await delay(10);
        if (state.pendingOpens.size) failed = true;
        for (const session of state.sessions) { try { await session.destroy(); } catch { failed = true; } }
        for (const socket of state.sockets) socket.destroy();
        const until = Date.now() + 3000;
        while (state.sockets.size && Date.now() < until) await delay(10);
        if (state.sockets.size) failed = true;
        try { cluster.close(); } catch { failed = true; }
        state.closed = true; state.cleanupComplete = !failed;
        signal?.removeEventListener("abort", abort);
        check(!failed, "LOCAL_FACTORY_CLEANUP_FAILED");
        return evidence();
      })();
      return closing;
    },
  };
  const abort = () => { void factory.close().catch(() => { state.cleanupComplete = false; }); };
  Object.freeze(factory);
  ownedFactories.add(factory); stateByFactory.set(factory, state);
  signal?.addEventListener("abort", abort, { once: true });
  return factory;
}
