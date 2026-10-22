/**
 * DB 소스 인벤토리의 실패 경계를 구현보다 먼저 고정합니다.
 * 합성 바이트·경로만 전달하며 SQL이나 운영 환경 파일을 실행하지 않습니다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const g1Source = `export const academicG1Migrations = [
  "migrate-one.sql", "migrate-two.sql",
];`;

/** 검증기에 파일 시스템·Git·환경변수 접근을 맡기지 않는 합성 입력입니다. */
function fixture() {
  const one = "scripts/migrate-one.sql";
  const two = "scripts/migrate-two.sql";
  const command = "scripts/migrate-one.mjs";
  return {
    inventory: {
      version: 1,
      sql: [
        { id: "g1-one", path: one, role: "versioned_candidate", sha256: sha256("ONE"), predecessors: [] },
        { id: "g1-two", path: two, role: "versioned_candidate", sha256: sha256("TWO"), predecessors: ["g1-one"] },
      ],
      g1Order: [one, two],
      scripts: [{ path: command, effect: "db_schema", defaultBehavior: "writes", writeOptions: [], commands: ["db:migrate-one"] }],
    },
    trackedSqlPaths: [one, two],
    untrackedSqlPaths: [],
    trackedScriptPaths: [command],
    untrackedScriptPaths: [],
    fileContents: { [one]: Buffer.from("ONE"), [two]: Buffer.from("TWO"), [command]: Buffer.from("// 합성 스크립트") },
    symlinkPaths: [],
    g1Source,
    packageScripts: { "db:migrate-one": `node ${command}` },
  };
}

/** 각 사례가 같은 순수 함수와 진단 코드 계약을 사용하도록 합니다. */
async function diagnostics(input) {
  const { validateSourceInventory } = await import("../_lib/db-source-inventory.mjs");
  return validateSourceInventory(input).map((item) => item.code);
}

async function rejects(input, code) {
  const actual = await diagnostics(input);
  assert.ok(actual.includes(code), `기대한 ${code}, 실제: ${actual.join(", ")}`);
}

test("알려진 SQL·MJS와 G1 순서가 일치하면 통과한다", async () => {
  assert.deepEqual(await diagnostics(fixture()), []);
});

test("SQL 원본 한 바이트 변경을 해시 불일치로 거부한다", async () => {
  const input = fixture();
  input.fileContents["scripts/migrate-one.sql"] = Buffer.from("ONE ");
  await rejects(input, "HASH_MISMATCH");
});

test("CI에서 Git 추적된 새 경로의 SQL이 목록 밖이면 거부한다", async () => {
  const input = fixture();
  input.trackedSqlPaths.push("other/new.sql");
  input.fileContents["other/new.sql"] = Buffer.from("SELECT 1;");
  await rejects(input, "UNREGISTERED_SQL");
});

test("로컬 미추적 새 SQL도 목록 밖이면 거부한다", async () => {
  const input = fixture();
  input.untrackedSqlPaths.push("scripts/new.sql");
  input.fileContents["scripts/new.sql"] = Buffer.from("SELECT 1;");
  await rejects(input, "UNREGISTERED_SQL");
});

test("누락 파일과 중복 경로·ID를 각각 거부한다", async () => {
  const missing = fixture();
  delete missing.fileContents["scripts/migrate-one.sql"];
  await rejects(missing, "MISSING_SOURCE");

  const duplicatePath = fixture();
  duplicatePath.inventory.sql.push({ ...duplicatePath.inventory.sql[0], id: "another" });
  await rejects(duplicatePath, "DUPLICATE_PATH");

  const duplicateId = fixture();
  duplicateId.inventory.sql[1].id = "g1-one";
  await rejects(duplicateId, "DUPLICATE_ID");
});

test("경로 이탈과 심볼릭 링크를 거부한다", async () => {
  const escape = fixture();
  escape.inventory.sql[0].path = "../outside.sql";
  await rejects(escape, "UNSAFE_PATH");

  const symlink = fixture();
  symlink.symlinkPaths.push("scripts/migrate-one.sql");
  await rejects(symlink, "SYMLINK_PATH");
});

test("G1 중간 순서 변경과 실행 식을 거부한다", async () => {
  const reordered = fixture();
  reordered.g1Source = g1Source.replace('"migrate-one.sql", "migrate-two.sql"', '"migrate-two.sql", "migrate-one.sql"');
  await rejects(reordered, "G1_ORDER_MISMATCH");

  const expression = fixture();
  expression.g1Source = 'export const academicG1Migrations = [...otherMigrations];';
  await rejects(expression, "G1_LITERAL_REQUIRED");
});

test("선행 ID 누락과 순환을 거부한다", async () => {
  const unknown = fixture();
  unknown.inventory.sql[1].predecessors = ["missing"];
  await rejects(unknown, "UNKNOWN_PREDECESSOR");

  const cycle = fixture();
  cycle.inventory.sql[0].predecessors = ["g1-two"];
  await rejects(cycle, "DEPENDENCY_CYCLE");
});

test("새 관리 MJS와 새 npm 연결 명령이 미분류면 거부한다", async () => {
  const newScript = fixture();
  newScript.trackedScriptPaths.push("scripts/cleanup-new.mjs");
  newScript.fileContents["scripts/cleanup-new.mjs"] = Buffer.from("// 합성 정리 명령");
  await rejects(newScript, "UNREGISTERED_SCRIPT");

  const newCommand = fixture();
  newCommand.packageScripts["db:migrate-one-again"] = "node scripts/migrate-one.mjs";
  await rejects(newCommand, "UNREGISTERED_COMMAND");
});

test("현재 인벤토리는 읽기 전용 preflight·현행 뷰와 알려진 명령 동작을 분리한다", () => {
  const inventory = JSON.parse(readFileSync(join(root, "scripts/db/source-inventory.json"), "utf8"));
  assert.equal(inventory.sql.length, 17);
  assert.equal(inventory.scripts.length, 18);
  assert.equal(inventory.sql.find((entry) => entry.path === "scripts/preflight-academic-students.sql")?.role, "read_only_preflight");
  assert.equal(inventory.sql.find((entry) => entry.path === "scripts/sql/markdown-image-references.sql")?.role, "current_definition_or_installer");
  assert.equal(inventory.scripts.find((entry) => entry.path === "scripts/migrate-html-to-markdown.mjs")?.defaultBehavior, "writes");
  assert.equal(inventory.scripts.find((entry) => entry.path === "scripts/migrate-rate-limit-reservations.mjs")?.defaultBehavior, "read_only");
  assert.equal(inventory.scripts.find((entry) => entry.path === "scripts/seed-admin.mjs")?.defaultBehavior, "rejects");
});

test("가짜 DB 주소가 있어도 CLI는 소스만 검사하고 통과한다", () => {
  const result = spawnSync(process.execPath, ["scripts/check-db-source-inventory.mjs"], {
    cwd: root,
    env: { PATH: process.env.PATH ?? "", DATABASE_URL: "postgresql://ci:ci@127.0.0.1:1/isolated" },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, "소스 검사기는 DB 접속 없이 종료해야 합니다.");
  assert.match(result.stdout, /SQL 17개.*MJS 18개/);
});
