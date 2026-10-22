/**
 * 현재 커밋과 로컬 작업 트리의 DB 소스 목록을 읽기 전용으로 대조합니다.
 * Git 경로·파일 바이트만 읽고 SQL, 모듈, DB 연결, 환경 파일은 실행하거나 불러오지 않습니다.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { validateSourceInventory } from "./_lib/db-source-inventory.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sqlGlob = ["*.sql"];
const scriptGlobs = ["scripts/migrate-*.mjs", "scripts/backfill-*.mjs", "scripts/seed-*.mjs", "scripts/cleanup-*.mjs"];

/** CI의 추적 파일과 로컬의 미추적·비무시 파일을 별도로 발견합니다. */
function gitPaths(mode, globs) {
  const args = mode === "tracked" ? ["ls-files", "-z", "--", ...globs]
    : ["ls-files", "--others", "--exclude-standard", "-z", "--", ...globs];
  return execFileSync("git", args, { cwd: root, maxBuffer: 4 * 1024 * 1024 })
    .toString("utf8").split("\0").filter(Boolean);
}

/** 경로의 어느 구성 요소라도 링크라면 실제 내용은 읽지 않고 검증기에 알립니다. */
function sourceBytes(paths) {
  const fileContents = {};
  const symlinkPaths = [];
  for (const path of paths) {
    if (typeof path !== "string" || !path.startsWith("scripts/") || path.includes("\\") ||
        path.split("/").some((part) => part === "" || part === "." || part === "..")) continue;
    const absolute = resolve(root, path);
    if (!absolute.startsWith(`${root}${sep}`)) continue;
    let linked = false;
    try {
      let part = root;
      for (const segment of path.split("/")) {
        part = resolve(part, segment);
        if (lstatSync(part).isSymbolicLink()) { linked = true; break; }
      }
      if (linked) symlinkPaths.push(path);
      else fileContents[path] = readFileSync(absolute);
    } catch (error) {
      // 누락 파일은 순수 검증기가 MISSING_SOURCE로 보고하고 다른 I/O 오류는 즉시 중단합니다.
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return { fileContents, symlinkPaths };
}

try {
  const inventory = JSON.parse(readFileSync(resolve(root, "scripts/db/source-inventory.json"), "utf8"));
  const packageScripts = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")).scripts;
  const g1Source = readFileSync(resolve(root, "tests/support/academic-g1-fixture.mjs"), "utf8");
  const trackedSqlPaths = gitPaths("tracked", sqlGlob);
  const untrackedSqlPaths = gitPaths("untracked", sqlGlob);
  const trackedScriptPaths = gitPaths("tracked", scriptGlobs);
  const untrackedScriptPaths = gitPaths("untracked", scriptGlobs);
  const { fileContents, symlinkPaths } = sourceBytes([
    ...inventory.sql.map((entry) => entry.path), ...inventory.scripts.map((entry) => entry.path),
  ]);
  const errors = validateSourceInventory({ inventory, trackedSqlPaths, untrackedSqlPaths,
    trackedScriptPaths, untrackedScriptPaths, fileContents, symlinkPaths, g1Source, packageScripts });
  if (errors.length > 0) {
    for (const error of errors) console.error(`DB 소스 목록 위반 [${error.code}] ${error.path}`.trim());
    process.exitCode = 1;
  } else {
    console.log(`DB 소스 목록 검사 통과: SQL ${inventory.sql.length}개, MJS ${inventory.scripts.length}개`);
  }
} catch {
  console.error("DB 소스 목록을 읽지 못했습니다. Git·목록 파일과 저장소 경로를 확인하세요.");
  process.exitCode = 1;
}
