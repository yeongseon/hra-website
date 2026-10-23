/**
 * 현재 Git 저장소의 versioned SQL 소스를 읽기 전용으로 검사한다.
 * DB·SQL·관리 모듈·환경 파일을 실행하지 않으며 caller JSON을 관측/승인으로 신뢰하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { constants, lstatSync, openSync, fstatSync, readFileSync, closeSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { validateMigrationManifest, validateLedgerSnapshot, versionedSqlDirectory, isVersionedSqlPath } from "./_lib/db-migration-manifest.mjs";

const manifestPath = "scripts/db/migration-manifest.json";
const fail = code => { throw new Error(code); };

/** 입력 파일 경로는 저장소 안의 정규 상대 경로로 제한하고 모든 link 구간을 거부한다. */
function checkedPath(root, relative) {
  if (typeof relative !== "string" || !/^[A-Za-z0-9_./-]+$/.test(relative) ||
      relative.split("/").some(part => !part || part === "." || part === "..")) fail("INPUT_PATH");
  let absolute = root;
  const parts = relative.split("/");
  for (const [index, part] of parts.entries()) {
    absolute = resolve(absolute, part);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) fail("SOURCE_SYMLINK");
    if (index < parts.length - 1 && !stat.isDirectory()) fail("INPUT_PATH");
  }
  return absolute;
}

/** 유한 크기의 일반 파일만 원본 bytes로 읽고 최종 파일의 symlink 교체도 거부한다. */
function readBytes(root, relative, maximum) {
  const absolute = checkedPath(root, relative);
  if (!lstatSync(absolute).isFile()) fail("INPUT_SIZE");
  const file = openSync(absolute, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(file);
    if (!stat.isFile() || stat.size > maximum) fail("INPUT_SIZE");
    const bytes = readFileSync(file);
    if (bytes.length > maximum) fail("INPUT_SIZE");
    return bytes;
  } finally { closeSync(file); }
}

try {
  const args = process.argv.slice(2), options = {};
  for (let index = 0; index < args.length; index += 2) {
    if (!["--prior-manifest", "--ledger-snapshot"].includes(args[index]) || !args[index + 1] || Object.hasOwn(options, args[index])) fail("CLI_ARGUMENTS");
    options[args[index]] = args[index + 1];
  }
  const root = realpathSync(execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: process.cwd(), stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").trim());
  const git = args => execFileSync("git", args, { cwd: root, maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }).toString("utf8").split("\0").filter(Boolean);
  if (!git(["ls-files", "-z", "--", manifestPath]).includes(manifestPath)) fail("MANIFEST_UNTRACKED");
  const json = relative => {
    if (!relative.endsWith(".json")) fail("INPUT_PATH");
    return JSON.parse(readBytes(root, relative, 1024 * 1024).toString("utf8"));
  };
  const manifest = json(manifestPath);
  // SQL가 없는 초기 상태에서도 디렉터리 자체가 다른 위치를 가리키면 실패한다.
  try {
    if (!lstatSync(checkedPath(root, versionedSqlDirectory)).isDirectory()) fail("INPUT_PATH");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const sqlOnly = paths => paths.filter(file => /\.sql$/i.test(file));
  const trackedSqlPaths = sqlOnly(git(["ls-files", "-z", "--", versionedSqlDirectory]));
  // 이 범위에서는 ignore된 미등록 SQL도 놓치지 않는다. legacy SQL은 기존 source inventory 소유다.
  const untrackedSqlPaths = sqlOnly(git(["ls-files", "--others", "-z", "--", versionedSqlDirectory]));
  const fileContents = {}, symlinkPaths = [];
  let bytesRead = 0;
  const entries = Array.isArray(manifest?.migrations) ? manifest.migrations : [];
  if (entries.length > 1000) fail("MANIFEST_SCHEMA");
  for (const entry of entries) {
    try {
      // 경로가 schema를 벗어나면 파일을 읽기 전에 순수 검증기로 넘긴다.
      if (!isVersionedSqlPath(entry?.path)) continue;
      const bytes = readBytes(root, entry.path, 2 * 1024 * 1024);
      bytesRead += bytes.length;
      if (bytesRead > 16 * 1024 * 1024) fail("INPUT_SIZE");
      fileContents[entry.path] = bytes;
    } catch (error) {
      if (error.message === "SOURCE_SYMLINK") symlinkPaths.push(entry.path);
      else if (error.code !== "ENOENT") throw error;
    }
  }
  const priorManifest = options["--prior-manifest"] ? json(options["--prior-manifest"]) : undefined;
  const validation = validateMigrationManifest({ manifest, fileContents, trackedSqlPaths, untrackedSqlPaths, symlinkPaths, priorManifest });
  const ledger = options["--ledger-snapshot"] ? validateLedgerSnapshot(manifest, json(options["--ledger-snapshot"])) : null;
  const diagnostics = [...new Set([...validation.diagnostics, ...(ledger?.diagnostics ?? [])])].sort();
  const ok = diagnostics.length === 0;
  console.log(JSON.stringify({ ok, state: ok ? manifest.state : null, migrationCount: ok ? manifest.migrations.length : null,
    digest: ok ? validation.digest : null, priorCompared: priorManifest !== undefined,
    ledgerSnapshotCompared: ledger !== null, ledgerPrefixLength: ledger?.ok ? ledger.prefixLength : null,
    observedDatabase: false, readyToApply: false, diagnostics }));
  if (!ok) process.exitCode = 1;
} catch (error) {
  // 예외 메시지·경로·SQL·사용자 입력을 반사하지 않고 자체 고정 코드만 출력한다.
  const safeCodes = new Set(["INPUT_PATH", "SOURCE_SYMLINK", "INPUT_SIZE", "CLI_ARGUMENTS", "MANIFEST_UNTRACKED", "MANIFEST_SCHEMA"]);
  console.log(JSON.stringify({ ok: false, readyToApply: false, observedDatabase: false, diagnostics: [safeCodes.has(error.message) ? error.message : "SOURCE_READ_FAILED"] }));
  process.exitCode = 1;
}
