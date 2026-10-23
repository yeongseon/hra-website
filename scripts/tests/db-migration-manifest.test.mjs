/**
 * source-only manifest/ledger 계약을 순수 변형 입력과 실제 임시 Git 저장소에서 검증한다.
 * SQL·DB·환경 파일·관리 모듈은 실행하지 않는다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync, execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { canonicalManifestDigest, validateMigrationManifest, validatePriorManifest, validateLedgerSnapshot } from "../_lib/db-migration-manifest.mjs";

const repository = fileURLToPath(new URL("../..", import.meta.url));
const manifestPath = "scripts/db/migration-manifest.json";
const directory = "scripts/db/versioned";
const bytes = [Buffer.from("SELECT 1;\n"), Buffer.from("SELECT 2;\r\n")];
const manifest = () => ({ schemaVersion: 1, state: "configured", executionContract: "postgresql-file-transaction-v1", migrations: bytes.map((value, index) => ({ sequence: index + 1, id: `migration-${index + 1}`, path: `${directory}/${index + 1}.sql`, sha256: createHash("sha256").update(value).digest("hex"), transaction: "required" })) });
const unset = () => ({ ...manifest(), state: "unset", migrations: [] });
const fixture = () => { const value = manifest(); return { manifest: value, fileContents: Object.fromEntries(value.migrations.map((entry, index) => [entry.path, bytes[index]])), trackedSqlPaths: value.migrations.map(entry => entry.path) }; };
const snapshot = (length = 0) => ({ schemaVersion: 1, nativeLedgerExists: false, ledgerExists: true, ledgerSchemaVersion: 1, rows: manifest().migrations.slice(0, length).map(({ id, sequence, sha256 }) => ({ id, sequence, sha256, status: "applied" })) });

test("미설정과 등록된 소스, empty/prefix/full snapshot을 서로 다른 의미로 통과시킨다", () => {
  assert.equal(validateMigrationManifest({ manifest: unset() }).ok, true);
  assert.equal(validateMigrationManifest(fixture()).ok, true);
  for (const length of [0, 1, 2]) assert.equal(validateLedgerSnapshot(manifest(), snapshot(length)).prefixLength, length);
  assert.equal(validateLedgerSnapshot(unset(), { ...snapshot(), ledgerExists: false, ledgerSchemaVersion: null }).ok, true);
});

test("canonical digest는 JSON key순서/서식과 무관하고 실행 의미와 원본 checksum을 포함한다", () => {
  const value = manifest();
  const reordered = { migrations: [], executionContract: value.executionContract, state: value.state, schemaVersion: value.schemaVersion };
  reordered.migrations = value.migrations.map(({ transaction, sha256, path, sequence, id }) => ({ transaction, sha256, path, id, sequence }));
  assert.equal(canonicalManifestDigest(value), canonicalManifestDigest(reordered));
  const changedOrder = { ...value, migrations: [...value.migrations].reverse().map((entry, index) => ({ ...entry, sequence: index + 1 })) };
  assert.notEqual(canonicalManifestDigest(value), canonicalManifestDigest(changedOrder));
  for (const field of ["id", "path", "sha256"]) {
    const changed = structuredClone(value);
    changed.migrations[0][field] = field === "id" ? "another-id" : field === "path" ? `${directory}/another.sql` : "a".repeat(64);
    assert.notEqual(canonicalManifestDigest(value), canonicalManifestDigest(changed));
  }
  for (const change of [entry => { entry.executionContract = "unreviewed"; }, entry => { entry.migrations[0].transaction = "none"; }]) {
    const changed = structuredClone(value); change(changed);
    assert.throws(() => canonicalManifestDigest(changed), /MANIFEST_SCHEMA/);
  }
});

for (const [name, mutate] of [
  ["unknown root field", input => { input.manifest.approved = true; }],
  ["unknown row field", input => { input.manifest.migrations[0].target = "private-sentinel"; }],
  ["unsupported schema", input => { input.manifest.schemaVersion = 2; }],
  ["configured empty", input => { input.manifest.migrations = []; }],
  ["unset nonempty", input => { input.manifest.state = "unset"; }],
  ["duplicate id", input => { input.manifest.migrations[1].id = input.manifest.migrations[0].id; }],
  ["duplicate sequence", input => { input.manifest.migrations[1].sequence = 1; }],
  ["duplicate path", input => { input.manifest.migrations[1].path = input.manifest.migrations[0].path; }],
  ["hole", input => { input.manifest.migrations[1].sequence = 3; }],
  ["reorder", input => { input.manifest.migrations.reverse(); }],
  ["traversal", input => { input.manifest.migrations[0].path = `${directory}/../secret.sql`; }],
  ["absolute path", input => { input.manifest.migrations[0].path = "/private.sql"; }],
  ["missing bytes", input => { delete input.fileContents[input.manifest.migrations[0].path]; }],
  ["byte newline drift", input => { input.fileContents[input.manifest.migrations[1].path] = Buffer.from("SELECT 2;\n"); }],
  ["untracked registered", input => { input.trackedSqlPaths.pop(); input.untrackedSqlPaths = [input.manifest.migrations[1].path]; }],
  ["unregistered SQL", input => { input.untrackedSqlPaths = [`${directory}/unknown.sql`]; }],
  ["parent symlink", input => { input.symlinkPaths = ["scripts/db"]; }],
]) test(`manifest 변형 거부: ${name}`, () => { const input = fixture(); mutate(input); const result = validateMigrationManifest(input); assert.equal(result.ok, false); assert.equal(result.digest, null); });

test("strict schema는 manifest와 ledger의 null·boolean·object·array ID를 문자열로 바꾸지 않는다", () => {
  for (const id of [null, true, false, {}, [], 1]) {
    const input = fixture(); input.manifest.migrations[0].id = id;
    assert.equal(validateMigrationManifest(input).ok, false);
    const ledger = snapshot(1); ledger.rows[0].id = id;
    assert.equal(validateLedgerSnapshot(manifest(), ledger).ok, false);
  }
  for (const sequence of [null, true, "1", {}, 1.5]) {
    const input = fixture(); input.manifest.migrations[0].sequence = sequence;
    assert.equal(validateMigrationManifest(input).ok, false);
    const ledger = snapshot(1); ledger.rows[0].sequence = sequence;
    assert.equal(validateLedgerSnapshot(manifest(), ledger).ok, false);
  }
});

test("empty/unset에서도 잘못된 source 입력을 SOURCE_INPUT으로 거부한다", () => {
  for (const state of [unset(), manifest()]) {
    for (const change of [
      { fileContents: [] }, { fileContents: new Map() }, { fileContents: { "private-sentinel": Buffer.from("raw") } },
      { trackedSqlPaths: [null] }, { trackedSqlPaths: ["/private-sentinel.sql"] },
      { untrackedSqlPaths: [true] }, { untrackedSqlPaths: ["scripts/legacy.sql"] },
      { symlinkPaths: [null] }, { symlinkPaths: ["../private-sentinel"] }, { symlinkPaths: ["unrelated"] },
    ]) {
      const result = validateMigrationManifest({ ...fixture(), manifest: state, ...change });
      assert.deepEqual(result, { ok: false, diagnostics: ["SOURCE_INPUT"], digest: null });
    }
  }
  for (const value of [null, true, [], "private-sentinel"]) assert.deepEqual(validateMigrationManifest(value).diagnostics, ["SOURCE_INPUT"]);
  const contents = Object.assign(Object.create(null), fixture().fileContents);
  assert.equal(validateMigrationManifest({ ...fixture(), fileContents: contents }).ok, true);
});

test("prior prefix는 같은 의미면 유지하고 append만 허용하며 호출자 입력 이상으로 신뢰하지 않는다", () => {
  const value = manifest(), prior = { ...value, migrations: value.migrations.slice(0, 1) };
  assert.equal(validatePriorManifest(value, prior).ok, true);
  assert.equal(validatePriorManifest(value, unset()).ok, true);
  for (const mutate of [entry => { entry.migrations[0].id = "changed"; }, entry => { entry.migrations[0].sha256 = "b".repeat(64); }, entry => { entry.migrations = []; entry.state = "unset"; }]) {
    const changed = structuredClone(value); mutate(changed);
    assert.equal(validatePriorManifest(changed, prior).ok, false);
  }
  assert.equal(validateMigrationManifest({ ...fixture(), priorManifest: { ...prior, approved: true } }).ok, false);
});

for (const [name, mutate] of [
  ["native empty exists", input => { input.nativeLedgerExists = true; input.ledgerExists = false; input.ledgerSchemaVersion = null; input.rows = []; }],
  ["native and own both empty", input => { input.nativeLedgerExists = true; input.rows = []; }],
  ["unsupported snapshot", input => { input.schemaVersion = 2; }],
  ["unsupported ledger schema", input => { input.ledgerSchemaVersion = 2; }],
  ["unknown root", input => { input.approved = true; }],
  ["unknown row", input => { input.rows[0].target = "private-sentinel"; }],
  ["failed row", input => { input.rows[0].status = "failed"; }],
  ["unknown id", input => { input.rows[0].id = "unknown"; }],
  ["hash drift", input => { input.rows[0].sha256 = "f".repeat(64); }],
  ["hole", input => { input.rows.shift(); }],
  ["duplicate", input => { input.rows[1] = input.rows[0]; }],
  ["reorder", input => { input.rows.reverse(); }],
  ["extra row", input => { input.rows.push(input.rows[0]); }],
  ["absent with rows", input => { input.ledgerExists = false; input.ledgerSchemaVersion = null; }],
]) test(`ledger 변형 거부: ${name}`, () => { const input = snapshot(2); mutate(input); assert.equal(validateLedgerSnapshot(manifest(), input).ok, false); });

test("manifest bytes/id 변경과 unset 상태를 기존 ledger로 정당화하지 않는다", () => {
  assert.equal(validateLedgerSnapshot(unset(), snapshot(1)).ok, false);
  const changed = manifest(); changed.migrations[0].sha256 = "c".repeat(64);
  assert.equal(validateLedgerSnapshot(changed, snapshot(1)).ok, false);
  changed.migrations[0].id = "changed-id";
  assert.equal(validateLedgerSnapshot(changed, snapshot(1)).ok, false);
});

/** 임시 Git의 stage 상태만 사용하며 source 모듈을 import하는 가짜 코드가 있어도 실행하지 않는다. */
async function gitFixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), "hra-migration-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = args => execFileSync("git", args, { cwd: root, stdio: "ignore" });
  git(["init", "-q"]);
  await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, manifestPath), JSON.stringify(manifest()));
  for (const [index, entry] of manifest().migrations.entries()) await writeFile(path.join(root, entry.path), bytes[index]);
  await writeFile(path.join(root, "package.json"), '{"scripts":{"danger":"untrusted-module-sentinel"}}');
  git(["add", "."]);
  const run = args => {
    const result = spawnSync(process.execPath, [path.join(repository, "scripts/check-db-migration-manifest.mjs"), ...(args ?? [])], { cwd: root, encoding: "utf8", timeout: 10000, maxBuffer: 65536 });
    assert.doesNotMatch(result.stdout + result.stderr, /private-sentinel|untrusted-module-sentinel|DATABASE_URL|SELECT 1/);
    return { status: result.status, output: JSON.parse(result.stdout) };
  };
  return { root, git, run };
}

test("실제 source CLI는 tracked 소스를 읽고 원문 SQL/모듈을 실행하지 않는다", async t => {
  const fixture = await gitFixture(t);
  const value = manifest();
  const sentinel = path.join(fixture.root, "private-sentinel");
  const source = Buffer.from(`require("node:fs").writeFileSync(${JSON.stringify(sentinel)}, "executed");`);
  value.migrations[0].sha256 = createHash("sha256").update(source).digest("hex");
  await writeFile(path.join(fixture.root, value.migrations[0].path), source);
  await writeFile(path.join(fixture.root, manifestPath), JSON.stringify(value));
  const result = fixture.run();
  await assert.rejects(readFile(sentinel), { code: "ENOENT" });
  assert.equal(result.status, 0);
  assert.equal(result.output.observedDatabase, false);
  assert.equal(result.output.readyToApply, false);
  assert.equal(result.output.migrationCount, 2);
  await writeFile(path.join(fixture.root, manifestPath), JSON.stringify(unset()));
  fixture.git(["rm", "-q", "-f", ...manifest().migrations.map(entry => entry.path)]);
  const empty = fixture.run();
  assert.equal(empty.status, 0); assert.equal(empty.output.state, "unset"); assert.equal(empty.output.readyToApply, false);
});

for (const [name, mutate] of [
  ["tracked bytes changed", async fixture => { await writeFile(path.join(fixture.root, manifest().migrations[0].path), "private-sentinel"); }],
  ["tracked missing", async fixture => { await rm(path.join(fixture.root, manifest().migrations[0].path)); }],
  ["untracked SQL", async fixture => { await writeFile(path.join(fixture.root, directory, "other.sql"), "private-sentinel"); }],
  ["ignored SQL", async fixture => { await writeFile(path.join(fixture.root, ".gitignore"), "ignored.sql\n"); await writeFile(path.join(fixture.root, directory, "ignored.sql"), "private-sentinel"); }],
  ["file symlink", async fixture => { const file = path.join(fixture.root, manifest().migrations[0].path); await rm(file); await symlink("/private-sentinel", file); }],
  ["directory symlink", async fixture => { await rm(path.join(fixture.root, directory), { recursive: true }); await symlink("/private-sentinel", path.join(fixture.root, directory)); }],
  ["manifest symlink", async fixture => { await rm(path.join(fixture.root, manifestPath)); await symlink("/private-sentinel", path.join(fixture.root, manifestPath)); }],
  ["traversal JSON input", async () => {}],
]) test(`실제 temp Git CLI 변형 거부: ${name}`, async t => {
  const fixture = await gitFixture(t); await mutate(fixture);
  const result = fixture.run(name === "traversal JSON input" ? ["--prior-manifest", "../private-sentinel.json"] : []);
  assert.equal(result.status, 1); assert.equal(result.output.ok, false);
});

test("CLI prior/ledger JSON은 관측 입력일 뿐이며 symlink·추가 권한 필드·과대 파일을 거부한다", async t => {
  const fixture = await gitFixture(t);
  await writeFile(path.join(fixture.root, "prior.json"), JSON.stringify({ ...manifest(), migrations: manifest().migrations.slice(0, 1) }));
  await writeFile(path.join(fixture.root, "ledger.json"), JSON.stringify(snapshot(1)));
  const good = fixture.run(["--prior-manifest", "prior.json", "--ledger-snapshot", "ledger.json"]);
  assert.equal(good.status, 0); assert.equal(good.output.ledgerPrefixLength, 1); assert.equal(good.output.observedDatabase, false);
  await writeFile(path.join(fixture.root, "ledger.json"), JSON.stringify({ ...snapshot(), approved: true }));
  assert.equal(fixture.run(["--ledger-snapshot", "ledger.json"]).status, 1);
  await rm(path.join(fixture.root, "prior.json")); await symlink("/private-sentinel", path.join(fixture.root, "prior.json"));
  assert.equal(fixture.run(["--prior-manifest", "prior.json"]).status, 1);
  await writeFile(path.join(fixture.root, "ledger.json"), " ".repeat(1024 * 1024 + 1));
  assert.equal(fixture.run(["--ledger-snapshot", "ledger.json"]).status, 1);
});
