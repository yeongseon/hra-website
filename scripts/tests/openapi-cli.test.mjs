/**
 * OpenAPI CLI가 기준 HEAD 비교 우회와 미등록 Route 확장을 실제 Git 발견에서 거부합니다.
 * 합성 저장소만 만들고 네트워크·DB·운영 파일을 읽거나 실행하지 않습니다.
 */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cli = join(root, "scripts/check-openapi-compat.mjs");

/** 지원 밖 Route 한 개를 가진 소유 임시 Git 저장소만 만듭니다. */
function temporaryRepository(t, extraRoute) {
  const temporary = mkdtempSync(join(tmpdir(), "hra-openapi-cli-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  for (const file of ["scripts/check-openapi-compat.mjs", "scripts/_lib/openapi-append-only.mjs",
    "packages/contracts/openapi.json"]) {
    mkdirSync(dirname(join(temporary, file)), { recursive: true });
    writeFileSync(join(temporary, file), readFileSync(join(root, file)));
  }
  for (const file of ["src/app/api/v1/me/route.ts", "src/app/api/v1/notices/route.ts", extraRoute]) {
    const target = join(temporary, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "export async function GET() {}\n");
  }
  const initialized = spawnSync("git", ["init", "--quiet"], { cwd: temporary, encoding: "utf8", timeout: 10_000 });
  assert.equal(initialized.status, 0);
  return temporary;
}

test("현재 HEAD를 기준으로 전달해 변경 비교를 건너뛰는 입력은 거부한다", () => {
  const head = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const run = spawnSync(process.execPath, [cli, "--base-sha", head], { cwd: root, encoding: "utf8", timeout: 10_000 });
  assert.equal(run.status, 1);
  assert.equal(run.stderr.trim(), "OPENAPI_BASE_INVALID");
});

test("새 route.js가 OpenAPI 밖으로 조용히 빠지지 않는다", (t) => {
  const temporary = temporaryRepository(t, "src/app/api/v1/extra/route.js");
  const run = spawnSync(process.execPath, [join(temporary, "scripts/check-openapi-compat.mjs"), "--self"],
    { cwd: temporary, encoding: "utf8", timeout: 10_000 });
  assert.equal(run.status, 1);
  assert.equal(run.stderr.trim(), "OPENAPI_ROUTE_PATH_INVALID");
});

test("Route Group 아래 실제 API v1 경로도 OpenAPI 밖에 숨기지 않는다", (t) => {
  const temporary = temporaryRepository(t, "src/app/(public)/api/v1/extra/route.ts");
  const run = spawnSync(process.execPath, [join(temporary, "scripts/check-openapi-compat.mjs"), "--self"],
    { cwd: temporary, encoding: "utf8", timeout: 10_000 });
  assert.equal(run.status, 1);
  assert.equal(run.stderr.trim(), "OPENAPI_ROUTE_PATH_INVALID");
});
