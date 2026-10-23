#!/usr/bin/env node
/**
 * 현재 OpenAPI 문서와 구현된 API v1 Route를 읽기 전용으로 대조합니다.
 * PR/base 또는 main push 이전 SHA의 기존 계약은 정확히 보존하고 새 항목만 허용합니다.
 * SQL·앱 모듈·환경 파일을 실행하지 않으며 오류에는 고정 코드만 출력합니다.
 */
import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { routePathFromFile, validateOpenApiAppendOnly } from "./_lib/openapi-append-only.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const specPath = "packages/contracts/openapi.json";
const maxBytes = 1024 * 1024;
const failure = (code) => Object.assign(new Error(code), { code });

/** Git 호출에는 셸을 사용하지 않고 민감한 stdout/stderr를 공개하지 않습니다. */
function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, maxBuffer: maxBytes, stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    throw failure("OPENAPI_GIT_INVALID");
  }
}

/** 심볼릭 링크와 초과 크기 파일을 읽기 전에 차단합니다. */
function regularFile(relative) {
  const absolute = resolve(root, relative);
  if (!absolute.startsWith(`${root}${sep}`)) throw failure("OPENAPI_SOURCE_INVALID");
  try {
    const stat = lstatSync(absolute);
    if (!stat.isFile() || realpathSync(absolute) !== absolute || stat.size > maxBytes) {
      throw failure("OPENAPI_SOURCE_INVALID");
    }
    return readFileSync(absolute);
  } catch {
    throw failure("OPENAPI_SOURCE_INVALID");
  }
}

/** 출력은 원문·경로를 반사하지 않고 JSON 구조만 검증기에 전달합니다. */
function parseDocument(bytes) {
  if (bytes.length > maxBytes) throw failure("OPENAPI_SOURCE_INVALID");
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { throw failure("OPENAPI_SOURCE_INVALID"); }
}

/** Next Route Group과 병렬 슬롯은 URL에 나타나지 않으므로 우회 경로 후보까지 발견합니다. */
function mayResolveToApiV1(path) {
  const segments = path.split("/").slice(2, -1)
    .filter((part) => !/^\([^)]*\)$/.test(part) && !part.startsWith("@"));
  return segments[0] === "api" && segments[1] === "v1";
}

try {
  const args = process.argv.slice(2);
  const self = args.length === 1 && args[0] === "--self";
  const compared = args.length === 2 && args[0] === "--base-sha" && /^[0-9a-f]{40}$/.test(args[1]);
  if (!self && !compared) throw failure("OPENAPI_ARGUMENTS_INVALID");

  let previous = null;
  if (compared) {
    // 기준 commit이 실제 조상인지 먼저 확인해 임의 객체나 현재 HEAD로의 비교 우회를 막습니다.
    if (git(["rev-parse", "HEAD"]).toString("utf8").trim() === args[1]) {
      throw failure("OPENAPI_BASE_INVALID");
    }
    try { execFileSync("git", ["merge-base", "--is-ancestor", args[1], "HEAD"],
      { cwd: root, stdio: "ignore", timeout: 10_000 }); }
    catch { throw failure("OPENAPI_BASE_INVALID"); }
    previous = parseDocument(git(["show", `${args[1]}:${specPath}`]));
  }

  const current = parseDocument(regularFile(specPath));
  const discovered = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "src/app"])
    .toString("utf8").split("\0").filter((path) => /\/route\.[A-Za-z0-9]+$/.test(path) && mayResolveToApiV1(path));
  const routePaths = [];
  let routeInvalid = false;
  for (const path of discovered) {
    if (!path.endsWith("/route.ts")) { routeInvalid = true; continue; }
    regularFile(path);
    const route = routePathFromFile(path);
    if (route === null) routeInvalid = true;
    else routePaths.push(route);
  }
  const diagnostics = validateOpenApiAppendOnly({ previous, current, routePaths });
  if (routeInvalid) diagnostics.push("OPENAPI_ROUTE_PATH_INVALID");
  for (const code of [...new Set(diagnostics)].sort()) console.error(code);
  if (diagnostics.length) process.exitCode = 1;
  else console.log(`OPENAPI_APPEND_ONLY_OK ${self ? "self" : "base"}`);
} catch (error) {
  console.error(error?.code && /^OPENAPI_[A-Z_]+$/.test(error.code) ? error.code : "OPENAPI_CHECK_FAILED");
  process.exitCode = 1;
}
