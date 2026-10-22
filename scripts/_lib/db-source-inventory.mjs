/**
 * DB 관련 소스 목록의 순수 검증기입니다.
 * 파일·Git·환경변수·DB에 직접 접근하지 않고 호출자가 건넨 현재 바이트만 비교합니다.
 */
import { createHash } from "node:crypto";

const sqlRoles = new Set(["versioned_candidate", "current_definition_or_installer", "read_only_preflight"]);
const effects = new Set(["db_schema", "db_schema_and_data", "db_data", "seed_db", "blob_and_db", "blob_cleanup"]);
const defaultBehaviors = new Set(["writes", "read_only", "rejects"]);
const managedScript = /^scripts\/(?:migrate|backfill|seed|cleanup)-[a-z0-9-]+\.mjs$/;
const packageTarget = /scripts\/(?:migrate|backfill|seed|cleanup)-[a-z0-9-]+\.mjs/g;

/** 저장소 안의 정규 상대 경로만 목록에 사용할 수 있습니다. */
function safePath(value, suffix) {
  return typeof value === "string" && value.startsWith("scripts/") && value.endsWith(suffix) &&
    !value.includes("\\") && !value.includes("\0") &&
    value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

/** G1의 현재 이중 따옴표 문자열 배열만 읽으며 JS 식을 평가하지 않습니다. */
export function parseG1LiteralOrder(source) {
  if (typeof source !== "string") return null;
  const match = source.match(/^export const academicG1Migrations\s*=\s*\[([\s\S]*?)\]\s*;/m);
  if (!match) return null;
  const parts = match[1].split(",").map((part) => part.trim());
  if (parts.at(-1) === "") parts.pop();
  if (parts.length === 0 || parts.some((part) => !/^"[a-z0-9-]+\.sql"$/.test(part))) return null;
  return parts.map((part) => `scripts/${part.slice(1, -1)}`);
}

/** ID 관계는 후보 SQL끼리만 허용하고 순환을 거부합니다. */
function hasCycle(edges) {
  const visiting = new Set();
  const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const parent of edges.get(id) ?? []) if (edges.has(parent) && visit(parent)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return [...edges.keys()].some(visit);
}

/**
 * 원본 바이트와 Git 발견 목록을 별도 입력으로 받아 검사 결과만 반환합니다.
 * 진단 코드는 테스트·CI의 안정된 계약이며 SQL의 실제 적용 상태를 뜻하지 않습니다.
 */
export function validateSourceInventory(input) {
  const errors = [];
  const add = (code, path = "") => errors.push({ code, path });
  const { inventory, trackedSqlPaths = [], untrackedSqlPaths = [], trackedScriptPaths = [],
    untrackedScriptPaths = [], fileContents = {}, symlinkPaths = [], g1Source, packageScripts = {} } = input ?? {};
  if (inventory?.version !== 1 || !Array.isArray(inventory.sql) ||
      !Array.isArray(inventory.scripts) || !Array.isArray(inventory.g1Order)) {
    add("INVALID_INVENTORY");
    return errors;
  }

  const declaredSql = new Set();
  const declaredScripts = new Set();
  const ids = new Map();
  const edges = new Map();
  const links = new Set(symlinkPaths);
  const isLinked = (path) => typeof path === "string" &&
    [...links].some((link) => path === link || path.startsWith(`${link}/`));
  const verifySource = (entry, suffix) => {
    const { path } = entry;
    if (!safePath(path, suffix)) add("UNSAFE_PATH", String(path ?? ""));
    if (isLinked(path)) add("SYMLINK_PATH", path);
    if (!Object.hasOwn(fileContents, path)) add("MISSING_SOURCE", path);
    else if (!(fileContents[path] instanceof Uint8Array) ||
      typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
      createHash("sha256").update(fileContents[path]).digest("hex") !== entry.sha256) add("HASH_MISMATCH", path);
  };

  for (const entry of inventory.sql) {
    if (!entry || typeof entry !== "object") { add("INVALID_INVENTORY"); continue; }
    verifySource(entry, ".sql");
    if (declaredSql.has(entry.path)) add("DUPLICATE_PATH", entry.path);
    declaredSql.add(entry.path);
    if (!sqlRoles.has(entry.role)) add("INVALID_ROLE", entry.path);
    if (entry.role === "versioned_candidate") {
      if (typeof entry.id !== "string" || !/^[a-z0-9][a-z0-9-]*$/.test(entry.id) ||
          !Array.isArray(entry.predecessors) || entry.predecessors.some((id) => typeof id !== "string")) {
        add("INVALID_CANDIDATE", entry.path);
      } else {
        if (ids.has(entry.id)) add("DUPLICATE_ID", entry.path);
        ids.set(entry.id, entry.path);
        edges.set(entry.id, entry.predecessors);
      }
    } else if (entry.id !== undefined || entry.predecessors !== undefined) add("INVALID_CANDIDATE", entry.path);
  }

  for (const [id, parents] of edges) {
    for (const parent of parents) if (!ids.has(parent)) add("UNKNOWN_PREDECESSOR", ids.get(id));
  }
  if (hasCycle(edges)) add("DEPENDENCY_CYCLE");

  const g1Order = parseG1LiteralOrder(g1Source);
  if (!g1Order) add("G1_LITERAL_REQUIRED");
  else if (JSON.stringify(g1Order) !== JSON.stringify(inventory.g1Order)) add("G1_ORDER_MISMATCH");
  for (const path of inventory.g1Order) {
    if (!inventory.sql.some((entry) => entry.path === path && entry.role === "versioned_candidate")) {
      add("G1_ROLE_MISMATCH", path);
    }
  }

  for (const path of new Set([...trackedSqlPaths, ...untrackedSqlPaths])) {
    if (!declaredSql.has(path)) add("UNREGISTERED_SQL", path);
  }
  for (const path of declaredSql) {
    if (![...trackedSqlPaths, ...untrackedSqlPaths].includes(path)) add("UNDISCOVERED_SOURCE", path);
  }

  const actualCommands = new Map();
  for (const [name, command] of Object.entries(packageScripts)) {
    if (typeof command !== "string") continue;
    for (const path of command.match(packageTarget) ?? []) {
      const names = actualCommands.get(path) ?? [];
      names.push(name);
      actualCommands.set(path, names);
    }
  }
  for (const entry of inventory.scripts) {
    if (!entry || typeof entry !== "object") { add("INVALID_INVENTORY"); continue; }
    verifySource(entry, ".mjs");
    if (!managedScript.test(entry.path)) add("UNSAFE_PATH", String(entry.path ?? ""));
    if (declaredScripts.has(entry.path)) add("DUPLICATE_PATH", entry.path);
    declaredScripts.add(entry.path);
    if (!effects.has(entry.effect) || !defaultBehaviors.has(entry.defaultBehavior) ||
        !Array.isArray(entry.writeOptions) || entry.writeOptions.some((arg) => typeof arg !== "string") ||
        (entry.previewOptions !== undefined && (!Array.isArray(entry.previewOptions) ||
          entry.previewOptions.some((arg) => typeof arg !== "string"))) ||
        !Array.isArray(entry.commands) || entry.commands.some((name) => typeof name !== "string")) {
      add("INVALID_SCRIPT_ROLE", entry.path);
    } else if (JSON.stringify([...entry.commands].sort()) !==
               JSON.stringify([...(actualCommands.get(entry.path) ?? [])].sort())) {
      add("UNREGISTERED_COMMAND", entry.path);
    }
  }
  for (const path of new Set([...trackedScriptPaths, ...untrackedScriptPaths])) {
    if (!declaredScripts.has(path)) add("UNREGISTERED_SCRIPT", path);
  }
  for (const path of declaredScripts) {
    if (![...trackedScriptPaths, ...untrackedScriptPaths].includes(path)) add("UNDISCOVERED_SOURCE", path);
  }
  for (const path of actualCommands.keys()) if (!declaredScripts.has(path)) add("UNREGISTERED_COMMAND", path);
  return errors;
}
