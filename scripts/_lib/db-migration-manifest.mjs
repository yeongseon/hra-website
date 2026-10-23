/**
 * 버전 SQL 소스와 호출자가 제공한 이력 snapshot의 순수 검증기다.
 * 파일·Git·DB·환경에 접근하지 않으며 SQL이나 관리 모듈을 실행하지 않는다.
 * 이전 snapshot 비교는 전달된 입력 사이의 불변성만 확인하며 운영 승인을 증명하지 않는다.
 */
import { createHash } from "node:crypto";

export const versionedSqlDirectory = "scripts/db/versioned";
const executionContract = "postgresql-file-transaction-v1";
const hashPattern = /^[a-f0-9]{64}$/;
const idPattern = /^[a-z][a-z0-9-]{0,63}$/;

/** JSON record와 null-prototype record만 허용하고 배열·클래스 인스턴스는 거부한다. */
function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/** JSON object의 알려진 키만 허용하며 승인·대상 같은 임의 필드를 인정하지 않는다. */
function exactKeys(value, keys) {
  return plainRecord(value) && Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}

/** 정규 상대 경로만 허용하고 모든 경로 구간의 traversal을 거부한다. */
export function isVersionedSqlPath(value) {
  return typeof value === "string" && value.startsWith(`${versionedSqlDirectory}/`) &&
    /^[a-z0-9/_-]+\.sql$/.test(value) && value.split("/").every(part => part && part !== "." && part !== "..");
}

/** 실행 의미를 포함한 manifest schema를 검증한다. SQL 지원 여부를 파싱하는 함수는 아니다. */
function manifestErrors(manifest) {
  const errors = new Set();
  if (!exactKeys(manifest, ["schemaVersion", "state", "executionContract", "migrations"]) ||
      manifest.schemaVersion !== 1 || !["unset", "configured"].includes(manifest.state) ||
      manifest.executionContract !== executionContract || !Array.isArray(manifest.migrations) || manifest.migrations.length > 1000) {
    return ["MANIFEST_SCHEMA"];
  }
  if ((manifest.state === "unset") !== (manifest.migrations.length === 0)) errors.add("MANIFEST_STATE");
  const ids = new Set(), sequences = new Set(), paths = new Set();
  for (const [index, entry] of manifest.migrations.entries()) {
    if (!exactKeys(entry, ["id", "sequence", "path", "sha256", "transaction"]) ||
        typeof entry.id !== "string" || !idPattern.test(entry.id) || !Number.isSafeInteger(entry.sequence) || entry.sequence < 1 ||
        typeof entry.sha256 !== "string" || !hashPattern.test(entry.sha256) || entry.transaction !== "required") {
      errors.add("MIGRATION_SCHEMA"); continue;
    }
    if (!isVersionedSqlPath(entry.path)) errors.add("MIGRATION_PATH");
    if (entry.sequence !== index + 1) errors.add("MIGRATION_ORDER");
    if (ids.has(entry.id)) errors.add("DUPLICATE_ID");
    if (sequences.has(entry.sequence)) errors.add("DUPLICATE_SEQUENCE");
    if (paths.has(entry.path)) errors.add("DUPLICATE_PATH");
    ids.add(entry.id); sequences.add(entry.sequence); paths.add(entry.path);
  }
  return [...errors].sort();
}

/** JSON의 키 순서와 공백을 제거하되 실행 의미·배열 순서·정확 checksum은 포함한다. */
function canonicalValue(manifest) {
  return {
    schemaVersion: manifest.schemaVersion, state: manifest.state, executionContract: manifest.executionContract,
    migrations: manifest.migrations.map(entry => ({ sequence: entry.sequence, id: entry.id, path: entry.path, sha256: entry.sha256, transaction: entry.transaction })),
  };
}

/** 엄격한 schema 검증을 통과한 manifest에만 canonical digest를 제공한다. */
export function canonicalManifestDigest(manifest) {
  if (manifestErrors(manifest).length) throw new Error("MANIFEST_SCHEMA");
  return createHash("sha256").update(JSON.stringify(canonicalValue(manifest))).digest("hex");
}

/** 이전에 전달된 전체 prefix를 현재 manifest에서 바꾸거나 지우지 못하게 한다. */
export function validatePriorManifest(manifest, priorManifest) {
  const diagnostics = new Set([...manifestErrors(manifest), ...manifestErrors(priorManifest).map(() => "PRIOR_MANIFEST_SCHEMA")]);
  if (!diagnostics.size) {
    const previous = canonicalValue(priorManifest).migrations;
    const current = canonicalValue(manifest).migrations;
    if (manifest.executionContract !== priorManifest.executionContract || manifest.schemaVersion !== priorManifest.schemaVersion ||
        previous.length > current.length || previous.some((entry, index) =>
          JSON.stringify(entry) !== JSON.stringify(current[index]))) diagnostics.add("PRIOR_PREFIX_CHANGED");
  }
  return { ok: diagnostics.size === 0, diagnostics: [...diagnostics].sort() };
}

/** Git 발견 목록과 실제 원본 bytes를 비교하고 versioned 디렉터리의 누락 등록을 막는다. */
export function validateMigrationManifest(input = {}) {
  const invalidSource = () => ({ ok: false, diagnostics: ["SOURCE_INPUT"], digest: null });
  if (!plainRecord(input)) return invalidSource();
  const { manifest, fileContents = {}, trackedSqlPaths = [], untrackedSqlPaths = [], symlinkPaths = [], priorManifest } = input;
  // symlink 목록은 versioned 범위의 파일/디렉터리 또는 그 조상 구간만 의미가 있다.
  const validSymlinkPath = value => typeof value === "string" && /^[a-z0-9/_-]+(?:\.sql)?$/.test(value) &&
    value.split("/").every(part => part && part !== "." && part !== "..") &&
    (value === versionedSqlDirectory || versionedSqlDirectory.startsWith(`${value}/`) || value.startsWith(`${versionedSqlDirectory}/`));
  if (!plainRecord(fileContents) || !Object.entries(fileContents).every(([file, bytes]) => isVersionedSqlPath(file) && bytes instanceof Uint8Array) ||
      !Array.isArray(trackedSqlPaths) || !trackedSqlPaths.every(isVersionedSqlPath) ||
      !Array.isArray(untrackedSqlPaths) || !untrackedSqlPaths.every(isVersionedSqlPath) ||
      !Array.isArray(symlinkPaths) || !symlinkPaths.every(validSymlinkPath)) return invalidSource();
  const diagnostics = new Set(manifestErrors(manifest));
  if (diagnostics.size) return { ok: false, diagnostics: [...diagnostics].sort(), digest: null };
  const declared = new Set(manifest.migrations.map(entry => entry.path));
  const tracked = new Set(trackedSqlPaths);
  for (const source of [...trackedSqlPaths, ...untrackedSqlPaths]) {
    if (typeof source !== "string" || !isVersionedSqlPath(source)) diagnostics.add("SOURCE_PATH");
    if (!declared.has(source)) diagnostics.add("UNREGISTERED_SQL");
  }
  for (const entry of manifest.migrations) {
    if (!tracked.has(entry.path)) diagnostics.add("SQL_UNTRACKED");
    if (symlinkPaths.some(link => typeof link === "string" && (entry.path === link || entry.path.startsWith(`${link}/`)))) diagnostics.add("SOURCE_SYMLINK");
    if (!Object.hasOwn(fileContents, entry.path)) diagnostics.add("SOURCE_MISSING");
    else if (!(fileContents[entry.path] instanceof Uint8Array) || createHash("sha256").update(fileContents[entry.path]).digest("hex") !== entry.sha256) diagnostics.add("SOURCE_HASH");
  }
  if (priorManifest !== undefined) for (const code of validatePriorManifest(manifest, priorManifest).diagnostics) diagnostics.add(code);
  return { ok: diagnostics.size === 0, diagnostics: [...diagnostics].sort(), digest: diagnostics.size ? null : canonicalManifestDigest(manifest) };
}

/**
 * caller-supplied snapshot이 manifest의 성공 prefix와 정확히 일치하는지 검사한다.
 * snapshot은 실제 DB 조회·승인·대상 identity의 증거가 아니며 이 함수는 DB에 접속하지 않는다.
 */
export function validateLedgerSnapshot(manifest, snapshot) {
  const diagnostics = new Set(manifestErrors(manifest));
  if (!exactKeys(snapshot, ["schemaVersion", "nativeLedgerExists", "ledgerExists", "ledgerSchemaVersion", "rows"]) ||
      snapshot.schemaVersion !== 1 || typeof snapshot.nativeLedgerExists !== "boolean" || typeof snapshot.ledgerExists !== "boolean" ||
      !Array.isArray(snapshot.rows) || snapshot.rows.length > 1000 ||
      (snapshot.ledgerExists ? snapshot.ledgerSchemaVersion !== 1 : snapshot.ledgerSchemaVersion !== null)) {
    diagnostics.add("LEDGER_SCHEMA");
  } else {
    if (snapshot.nativeLedgerExists) diagnostics.add(snapshot.ledgerExists ? "LEDGER_CONFLICT" : "NATIVE_LEDGER_PRESENT");
    if (!snapshot.ledgerExists && snapshot.rows.length) diagnostics.add("LEDGER_ABSENT_WITH_ROWS");
    if (!diagnostics.size) {
      if (manifest.state === "unset" && snapshot.rows.length) diagnostics.add("LEDGER_MANIFEST_UNSET");
      for (const [index, row] of snapshot.rows.entries()) {
        if (!exactKeys(row, ["id", "sequence", "sha256", "status"]) || row.status !== "applied" ||
            typeof row.id !== "string" || !idPattern.test(row.id) || !Number.isSafeInteger(row.sequence) || typeof row.sha256 !== "string" || !hashPattern.test(row.sha256)) {
          diagnostics.add("LEDGER_ROW_SCHEMA"); continue;
        }
        const expected = manifest.migrations[index];
        if (!expected || row.id !== expected.id || row.sequence !== expected.sequence || row.sha256 !== expected.sha256) diagnostics.add("LEDGER_PREFIX_MISMATCH");
      }
    }
  }
  return { ok: diagnostics.size === 0, diagnostics: [...diagnostics].sort(), prefixLength: diagnostics.size ? null : snapshot.rows.length };
}
