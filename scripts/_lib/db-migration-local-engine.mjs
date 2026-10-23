/**
 * 소유 로컬 PostgreSQL의 고정 세션에서만 검토된 migration을 파일별 원자 적용합니다.
 * URL·환경·driver를 만들지 않으며 실제 운영 baseline·운영 적용 권한을 제공하지 않습니다.
 * SQL helper는 transaction 제어를 서버에서 거부하기 위한 경계이며 임의 SQL sandbox가 아닙니다.
 */
import { createHash } from 'node:crypto';
import { validateMigrationManifest, validateLedgerSnapshot } from './db-migration-manifest.mjs';
import { assertOwnedLocalFactory } from '../../tests/support/db-migration-local-adapter.mjs';
import { collectLocalCatalog } from '../../tests/support/db-migration-catalog.mjs';

// manifest가 달라도 같은 DB의 모든 runner가 이 두 정수의 session lock을 공유합니다.
export const localMigrationLock = Object.freeze([145311847, 280]);
export const localMigrationBootstrapSql = `CREATE SCHEMA IF NOT EXISTS hra_migrations AUTHORIZATION hra_migration_operator;
CREATE TABLE hra_migrations.applied_migrations (
  id text PRIMARY KEY,
  sequence integer NOT NULL UNIQUE CHECK (sequence > 0),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  status text NOT NULL CHECK (status = 'applied')
);`;
const helperBody = 'BEGIN EXECUTE sql_text; END;';
const helperSql = `CREATE FUNCTION pg_temp.hra_apply_migration(sql_text text) RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public
AS $hra_local_helper$${helperBody}$hra_local_helper$;
REVOKE ALL ON FUNCTION pg_temp.hra_apply_migration(text) FROM PUBLIC;`;
const countsKeys = ['schemas', 'tables', 'columns', 'types', 'functions', 'constraints', 'indexes', 'views', 'triggers', 'policies', 'probeRows'];
const stages = new Set(['PRECHECK', 'LOCKED', 'RECONCILED', 'APPLYING', 'COMMITTING', 'COMMITTED', 'VERIFYING', 'VERIFIED', 'FAILED_PRECOMMIT', 'COMMIT_OUTCOME_UNKNOWN', 'RECONNECTING', 'RECONCILING', 'BLOCKED']);
const engineErrors = new WeakSet();
const safe = code => { const error = Object.assign(new Error(code), { safeEngineCode: code }); engineErrors.add(error); return error; };
const ensure = (condition, code) => { if (!condition) throw safe(code); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exact = (value, keys) => record(value) && Object.keys(value).sort().join() === [...keys].sort().join();
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);

/** 호출자의 변경 가능한 byte 배열과 JSON을 별도로 복제하고 SQL 파일을 다시 읽지 않습니다. */
function prepareInput(source, catalogContracts, timeoutMs) {
  ensure(record(source) && Object.keys(source).every(key => ['manifest', 'fileContents', 'trackedSqlPaths', 'untrackedSqlPaths', 'symlinkPaths', 'priorManifest'].includes(key)), 'SOURCE_INVALID');
  ensure(validateMigrationManifest(source).ok, 'SOURCE_INVALID');
  ensure(source.manifest.state === 'configured', 'MANIFEST_UNSET');
  const fileContents = {};
  let size = 0;
  for (const [path, bytes] of Object.entries(source.fileContents ?? {})) {
    size += bytes.byteLength;
    ensure(bytes.byteLength <= 2 * 1024 * 1024 && size <= 16 * 1024 * 1024, 'SOURCE_LIMIT');
    fileContents[path] = Buffer.from(bytes);
    try { new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fileContents[path]); }
    catch { throw safe('SOURCE_ENCODING'); }
  }
  const copied = { manifest: JSON.parse(JSON.stringify(source.manifest)), fileContents,
    trackedSqlPaths: [...(source.trackedSqlPaths ?? [])], untrackedSqlPaths: [...(source.untrackedSqlPaths ?? [])], symlinkPaths: [...(source.symlinkPaths ?? [])],
    ...(source.priorManifest === undefined ? {} : { priorManifest: JSON.parse(JSON.stringify(source.priorManifest)) }) };
  ensure(validateMigrationManifest(copied).ok, 'SOURCE_INVALID');
  ensure(Number.isInteger(timeoutMs) && timeoutMs >= 100 && timeoutMs <= 30000, 'TIMEOUT_INVALID');
  ensure(Array.isArray(catalogContracts) && catalogContracts.length === copied.manifest.migrations.length + 1, 'CATALOG_CONTRACT_INVALID');
  for (const contract of catalogContracts) ensure(exact(contract, ['digest', 'counts']) && digest(contract.digest) && exact(contract.counts, countsKeys) && Object.values(contract.counts).every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000), 'CATALOG_CONTRACT_INVALID');
  return { source: copied, catalogContracts: JSON.parse(JSON.stringify(catalogContracts)) };
}

/** 공개 결과에는 원본 예외·SQL·대상 ID를 넣지 않고 고정 상태와 집계만 반환합니다. */
export async function runLocalMigrations(options = {}) {
  let factory, source, catalogContracts, signal, timeoutMs = 10000;
  const result = { phase: 'PRECHECK', code: 'INPUT_INVALID', firstErrorCode: null, phases: ['PRECHECK'], applied: 0, pending: 0,
    manifestCompleted: false, manifestDigest: null, catalogDigest: null, cleanupComplete: true, cleanupCodes: [], observedLocalDatabase: false, productionReady: false };
  let input, session, backendId, locked = false, inTransaction = false, broken = false, committedPrefix = 0, commitAcknowledged = false, settingsEstablished = false;
  const transition = phase => { ensure(stages.has(phase), 'STATE_INVALID'); result.phase = phase; result.phases.push(phase); };
  const cleanupCode = code => { result.cleanupComplete = false; if (!result.cleanupCodes.includes(code)) result.cleanupCodes.push(code); };
  const bounded = async (operation, code, abortable = true, milliseconds = timeoutMs) => {
    let timer, abort;
    try {
      if (abortable && signal?.aborted) throw safe('INTERRUPTED');
      const cancellation = new Promise((_, reject) => {
        timer = setTimeout(() => reject(safe(code)), milliseconds);
        if (abortable && signal) { abort = () => reject(safe('INTERRUPTED')); signal.addEventListener('abort', abort, { once: true }); }
      });
      // 취소 listener를 먼저 설치한 뒤 다음 microtask에서 실제 동작을 시작합니다.
      const pending = Promise.resolve().then(() => { ensure(!abortable || !signal?.aborted, 'INTERRUPTED'); return operation(); });
      return await Promise.race([pending, cancellation]);
    } finally { clearTimeout(timer); if (abort) signal.removeEventListener('abort', abort); }
  };
  const query = async (text, values = [], abortable = true) => {
    ensure(!abortable || !signal?.aborted, 'INTERRUPTED');
    try { return await bounded(() => session.query(text, values), 'QUERY_TIMEOUT', abortable); }
    catch (error) {
      if (error?.code === 'LOCAL_TRANSPORT_ERROR' || engineErrors.has(error) && ['QUERY_TIMEOUT', 'INTERRUPTED'].includes(error.safeEngineCode)) broken = true;
      throw error;
    }
  };
  const checkedQuery = async (text, values, code) => {
    try { return await query(text, values); }
    catch (error) { if (engineErrors.has(error)) throw error; throw safe(code); }
  };
  const identity = async (initial = false) => {
    ensure(!signal?.aborted, 'INTERRUPTED');
    let observed;
    try { observed = await bounded(() => session.identity(), 'IDENTITY_TIMEOUT'); }
    catch (error) {
      if (error?.code === 'LOCAL_TRANSPORT_ERROR' || engineErrors.has(error) && ['IDENTITY_TIMEOUT', 'INTERRUPTED'].includes(error.safeEngineCode)) broken = true;
      throw error;
    }
    ensure(exact(observed, ['databaseId', 'scopeId', 'backendId']) && observed.databaseId === factory.expectedIdentity.databaseId && observed.scopeId === factory.expectedIdentity.scopeId && Number.isInteger(observed.backendId) && observed.backendId > 0, 'TARGET_MISMATCH');
    if (initial) backendId = observed.backendId;
    else ensure(observed.backendId === backendId, 'BACKEND_CHANGED');
    result.observedLocalDatabase = true;
    if (settingsEstablished) {
      const settings = (await query(`SELECT pg_catalog.current_setting('search_path') AS search_path,
        (SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='statement_timeout') AS statement_timeout,
        (SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='lock_timeout') AS lock_timeout,
        (SELECT setting::integer FROM pg_catalog.pg_settings WHERE name='idle_in_transaction_session_timeout') AS idle_timeout`)).rows;
      ensure(settings.length === 1 && settings[0].search_path === 'pg_catalog,public' && settings[0].statement_timeout === Math.max(50, Math.floor(timeoutMs * .75)) && settings[0].lock_timeout === Math.max(25, Math.floor(timeoutMs * .5)) && settings[0].idle_timeout === timeoutMs, 'SESSION_SETTINGS_CHANGED');
    }
    if (locked) {
      const value = await query('SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_locks WHERE locktype=\'advisory\' AND pid=pg_catalog.pg_backend_pid() AND classid=$1::oid AND objid=$2::oid AND objsubid=2 AND granted) AS held', localMigrationLock);
      ensure(value.rows.length === 1 && value.rows[0].held === true, 'LOCK_LOST');
    }
  };
  /** 최소 역할과 서버 제한을 확인한 후 같은 물리 세션에서 DB 전역 lock을 얻습니다. */
  const connect = async () => {
    ensure(!signal?.aborted, 'INTERRUPTED');
    let opening;
    try {
      session = await bounded(() => { opening = Promise.resolve(factory.open()); return opening; }, 'CONNECT_TIMEOUT');
    } catch (error) {
      if (opening && ['CONNECT_TIMEOUT', 'INTERRUPTED'].includes(error?.safeEngineCode)) {
        // 지연 연결을 관측한 뒤 폐기합니다. 예산 내 종료를 입증하지 못하면 완료로 보고하지 않습니다.
        const lateCleanup = opening.then(late => late.destroy());
        try { await bounded(() => lateCleanup, 'LATE_SESSION_CLEANUP_TIMEOUT', false, 10000); }
        catch { cleanupCode('OPEN_OUTCOME_UNCERTAIN'); }
      }
      throw error;
    }
    locked = false; broken = false; settingsEstablished = false;
    await identity(true);
    const role = await query(`SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypass, r.rolcreatedb AS createdb,
      r.rolcreaterole AS createrole, r.rolreplication AS replication,
      pg_catalog.has_schema_privilege(current_user,'public','USAGE') AS schema_usage,
      pg_catalog.has_schema_privilege(current_user,'public','CREATE') AS schema_create,
      pg_catalog.has_database_privilege(current_user,current_database(),'TEMP') AS temporary
      FROM pg_catalog.pg_roles r WHERE r.rolname=current_user`);
    const row = role.rows[0];
    ensure(role.rows.length === 1 && row.name === 'hra_migration_operator' && ['superuser', 'bypass', 'createdb', 'createrole', 'replication'].every(key => row[key] === false) && ['schema_usage', 'schema_create', 'temporary'].every(key => row[key] === true), 'ROLE_INVALID');
    await query(`SELECT pg_catalog.set_config('search_path','pg_catalog,public',false),
      pg_catalog.set_config('statement_timeout',$1,false), pg_catalog.set_config('lock_timeout',$2,false),
      pg_catalog.set_config('idle_in_transaction_session_timeout',$3,false)`, [`${Math.max(50, Math.floor(timeoutMs * .75))}ms`, `${Math.max(25, Math.floor(timeoutMs * .5))}ms`, `${timeoutMs}ms`]);
    settingsEstablished = true;
    await identity();
    try { await query('SELECT pg_catalog.pg_advisory_lock($1::integer,$2::integer)', localMigrationLock); }
    catch (error) {
      if (engineErrors.has(error)) throw error;
      throw safe(error?.code === '55P03' ? 'LOCK_TIMEOUT' : 'LOCK_ACQUIRE_FAILED');
    }
    locked = true;
    await identity();
  };
  /** native ledger의 이름은 어느 사용자 스키마에 있어도 자동 이전하지 않습니다. */
  const ledgerPresence = async () => {
    await identity();
    const rows = (await query(`SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE c.relname='__drizzle_migrations' AND n.nspname !~ '^pg_' AND n.nspname<>'information_schema') AS native,
      pg_catalog.to_regclass('hra_migrations.applied_migrations') IS NOT NULL AS ledger,
      EXISTS(SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname='hra_migrations') AS schema`)).rows;
    ensure(rows.length === 1 && ['native', 'ledger', 'schema'].every(key => typeof rows[0][key] === 'boolean'), 'LEDGER_OBSERVATION_INVALID');
    ensure(!rows[0].native, rows[0].ledger ? 'LEDGER_CONFLICT' : 'NATIVE_LEDGER_PRESENT');
    return rows[0];
  };
  /** 기존 ledger의 열·소유자·제약을 실제 catalog에서 확인합니다. */
  const validateLedgerShape = async () => {
    const rows = (await query(`SELECT c.relkind, c.relpersistence, c.relrowsecurity, c.relforcerowsecurity, pg_catalog.pg_get_userbyid(c.relowner) AS owner
      FROM pg_catalog.pg_class c WHERE c.oid=pg_catalog.to_regclass('hra_migrations.applied_migrations')`)).rows;
    ensure(rows.length === 1 && rows[0].relkind === 'r' && rows[0].relpersistence === 'p' && !rows[0].relrowsecurity && !rows[0].relforcerowsecurity && rows[0].owner === 'hra_migration_operator', 'LEDGER_SHAPE_INVALID');
    const columns = (await query(`SELECT attname AS name, pg_catalog.format_type(atttypid,atttypmod) AS type, attnotnull AS required,
      atthasdef AS has_default, attidentity AS identity, attgenerated AS generated FROM pg_catalog.pg_attribute
      WHERE attrelid='hra_migrations.applied_migrations'::pg_catalog.regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`)).rows;
    const expected = [['id', 'text'], ['sequence', 'integer'], ['sha256', 'text'], ['status', 'text']].map(([name, type]) => ({ name, type, required: true, has_default: false, identity: '', generated: '' }));
    ensure(JSON.stringify(columns) === JSON.stringify(expected), 'LEDGER_SHAPE_INVALID');
    const constraints = (await query(`SELECT pg_catalog.pg_get_constraintdef(oid,true) AS definition FROM pg_catalog.pg_constraint
      WHERE conrelid='hra_migrations.applied_migrations'::pg_catalog.regclass ORDER BY definition`)).rows.map(row => row.definition);
    const definitions = ["CHECK (sequence > 0)", "CHECK (sha256 ~ '^[a-f0-9]{64}$'::text)", "CHECK (status = 'applied'::text)", 'PRIMARY KEY (id)', 'UNIQUE (sequence)'].sort();
    ensure(JSON.stringify(constraints) === JSON.stringify(definitions), 'LEDGER_SHAPE_INVALID');
  };
  const bootstrap = async () => {
    const presence = await ledgerPresence();
    if (!presence.ledger) {
      if (presence.schema) {
        const schema = (await query(`SELECT pg_catalog.pg_get_userbyid(nspowner) AS owner,
          (SELECT count(*)::integer FROM pg_catalog.pg_class WHERE relnamespace=n.oid) +
          (SELECT count(*)::integer FROM pg_catalog.pg_proc WHERE pronamespace=n.oid) +
          (SELECT count(*)::integer FROM pg_catalog.pg_type WHERE typnamespace=n.oid AND typrelid=0) AS objects
          FROM pg_catalog.pg_namespace n WHERE nspname='hra_migrations'`)).rows;
        ensure(schema.length === 1 && schema[0].owner === 'hra_migration_operator' && schema[0].objects === 0, 'LEDGER_SCHEMA_CONFLICT');
      }
      await identity(); await query(localMigrationBootstrapSql);
    }
    await validateLedgerShape();
  };
  const reconcile = async (minimum = 0) => {
    const presence = await ledgerPresence(); ensure(presence.ledger, 'LEDGER_MISSING');
    await validateLedgerShape(); await identity();
    const rows = (await query('SELECT id,sequence,sha256,status FROM hra_migrations.applied_migrations ORDER BY sequence')).rows;
    const snapshot = { schemaVersion: 1, nativeLedgerExists: false, ledgerExists: true, ledgerSchemaVersion: 1, rows };
    const validation = validateLedgerSnapshot(input.source.manifest, snapshot);
    ensure(validation.ok && validation.prefixLength >= minimum, 'LEDGER_PREFIX_MISMATCH');
    result.applied = validation.prefixLength; result.pending = input.source.manifest.migrations.length - result.applied;
    await identity();
    let observed;
    try { observed = await bounded(() => collectLocalCatalog(session), 'CATALOG_READ_TIMEOUT'); }
    catch (error) {
      if (error?.code === 'LOCAL_TRANSPORT_ERROR' || engineErrors.has(error) && ['CATALOG_READ_TIMEOUT', 'INTERRUPTED'].includes(error.safeEngineCode)) broken = true;
      if (engineErrors.has(error)) throw error;
      throw safe('CATALOG_READ_FAILED');
    }
    ensure(exact(observed, ['digest', 'counts']) && digest(observed.digest) && exact(observed.counts, countsKeys), 'CATALOG_OBSERVATION_INVALID');
    result.catalogDigest = observed.digest;
    const contract = input.catalogContracts[result.applied];
    ensure(observed.digest === contract.digest && countsKeys.every(key => observed.counts[key] === contract.counts[key]), 'CATALOG_MISMATCH');
    await identity();
    return result.applied;
  };
  const helperAbsent = async () => {
    const rows = (await query(`SELECT count(*)::integer AS count FROM pg_catalog.pg_proc WHERE pronamespace=pg_catalog.pg_my_temp_schema() AND proname='hra_apply_migration'`)).rows;
    ensure(rows.length === 1 && rows[0].count === 0, 'HELPER_CONFLICT');
  };
  const helperValid = async () => {
    const rows = (await query(`SELECT p.prosrc AS body,p.prosecdef AS definer,p.proconfig AS config,pg_catalog.pg_get_userbyid(p.proowner) AS owner,
      l.lanname AS language,p.prorettype='pg_catalog.void'::pg_catalog.regtype AS returns_void,
      (SELECT count(*)=1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))))
      AND NOT EXISTS(SELECT 1 FROM pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        WHERE a.grantee<>p.proowner OR a.grantor<>p.proowner OR a.privilege_type<>'EXECUTE' OR a.is_grantable) AS private
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
      WHERE p.pronamespace=pg_catalog.pg_my_temp_schema() AND p.proname='hra_apply_migration' AND p.proargtypes='25'::pg_catalog.oidvector`)).rows;
    ensure(rows.length === 1 && rows[0].body === helperBody && rows[0].definer === false && rows[0].owner === 'hra_migration_operator' && rows[0].language === 'plpgsql' && rows[0].returns_void === true && rows[0].private === true && JSON.stringify(rows[0].config) === JSON.stringify(['search_path=pg_catalog, public']), 'HELPER_INVALID');
  };
  const dispose = async destroy => {
    if (!session) return;
    const previous = session; session = null; locked = false;
    try { await bounded(() => destroy ? previous.destroy() : previous.close(), 'SESSION_CLEANUP_TIMEOUT', false); }
    catch { cleanupCode('SESSION_CLEANUP_FAILED'); }
  };
  try {
    ensure(record(options) && Object.keys(options).every(key => ['factory', 'source', 'catalogContracts', 'signal', 'timeoutMs'].includes(key)), 'INPUT_INVALID');
    ({ factory, source, catalogContracts, signal, timeoutMs = 10000 } = options);
    ensure(signal === undefined || signal instanceof AbortSignal, 'SIGNAL_INVALID');
    input = prepareInput(source, catalogContracts, timeoutMs);
    result.manifestDigest = validateMigrationManifest(input.source).digest; result.pending = input.source.manifest.migrations.length;
    ensure(!signal?.aborted, 'INTERRUPTED');
    try { assertOwnedLocalFactory(factory); } catch { throw safe('FACTORY_UNOWNED'); }
    ensure(exact(factory.expectedIdentity, ['databaseId', 'scopeId']) && Object.isFrozen(factory.expectedIdentity), 'FACTORY_IDENTITY_INVALID');
    await connect(); transition('LOCKED'); await bootstrap(); await reconcile(); committedPrefix = result.applied; transition('RECONCILED');
    for (let index = result.applied; index < input.source.manifest.migrations.length; index++) {
      const migration = input.source.manifest.migrations[index], bytes = input.source.fileContents[migration.path];
      ensure(hash(bytes) === migration.sha256, 'SOURCE_HASH');
      await identity(); await helperAbsent(); transition('APPLYING');
      commitAcknowledged = false;
      try {
        await checkedQuery('BEGIN', [], 'BEGIN_FAILED'); inTransaction = true;
        await identity(); await checkedQuery(helperSql, [], 'HELPER_CREATE_FAILED'); await helperValid(); await identity();
        await checkedQuery('SELECT pg_temp.hra_apply_migration($1::text)', [new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)], 'MIGRATION_SQL_FAILED');
        await identity(); await helperValid(); await query('DROP FUNCTION pg_temp.hra_apply_migration(text)'); await helperAbsent();
        await checkedQuery("INSERT INTO hra_migrations.applied_migrations(id,sequence,sha256,status) VALUES($1,$2,$3,'applied')", [migration.id, migration.sequence, migration.sha256], 'LEDGER_INSERT_FAILED');
        await identity(); transition('COMMITTING');
        try { await query('COMMIT'); }
        catch (error) {
          // 지연 제약·serialization의 명시적 서버 거부만 precommit 실패로 확정합니다.
          if (['23502', '23503', '23505', '23514', '23P01', '40001', '40P01', '25P02', '2D000'].includes(error?.code)) throw safe('COMMIT_REJECTED');
          transition('COMMIT_OUTCOME_UNKNOWN'); result.firstErrorCode ??= 'COMMIT_OUTCOME_UNKNOWN'; inTransaction = false; broken = true;
          await dispose(true); transition('RECONNECTING'); await connect(); transition('RECONCILING');
          await reconcile(committedPrefix); transition('VERIFIED');
          result.manifestCompleted = result.pending === 0; result.code = result.manifestCompleted ? 'COMMIT_RECONCILED' : 'COMMIT_RECONCILED_PENDING';
          return result;
        }
        inTransaction = false; commitAcknowledged = true; committedPrefix = index + 1; result.applied = committedPrefix; result.pending = input.source.manifest.migrations.length - committedPrefix;
        transition('COMMITTED'); transition('VERIFYING'); await reconcile(committedPrefix); transition('VERIFIED');
      } catch (error) {
        if (commitAcknowledged || result.phases.includes('COMMIT_OUTCOME_UNKNOWN')) throw error;
        if (['QUERY_TIMEOUT', 'IDENTITY_TIMEOUT', 'INTERRUPTED'].includes(error?.safeEngineCode)) broken = true;
        if (inTransaction && !broken) {
          try { await query('ROLLBACK', [], false); inTransaction = false; }
          catch { cleanupCode('ROLLBACK_FAILED'); broken = true; }
        }
        transition('FAILED_PRECOMMIT'); throw error;
      }
    }
    result.manifestCompleted = result.pending === 0; result.code = 'APPLIED'; transition('VERIFIED');
  } catch (error) {
    result.code = engineErrors.has(error) ? error.safeEngineCode : 'LOCAL_OPERATION_FAILED';
    result.firstErrorCode ??= result.code;
    if (['QUERY_TIMEOUT', 'IDENTITY_TIMEOUT', 'CATALOG_READ_TIMEOUT', 'INTERRUPTED'].includes(result.code)) broken = true;
    if (result.phase !== 'FAILED_PRECOMMIT') transition('BLOCKED');
  } finally {
    if (session && locked && !broken) {
      try {
        const unlocked = await bounded(() => session.query('SELECT pg_catalog.pg_advisory_unlock($1::integer,$2::integer) AS unlocked', localMigrationLock), 'UNLOCK_TIMEOUT', false);
        ensure(unlocked.rows.length === 1 && unlocked.rows[0].unlocked === true, 'UNLOCK_NOT_HELD');
      }
      catch { cleanupCode('UNLOCK_FAILED'); broken = true; }
    }
    await dispose(broken);
    if (!result.cleanupComplete) result.manifestCompleted = false;
  }
  return result;
}
