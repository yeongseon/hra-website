/** 확장 검증이 운영 권한·자격 증명을 받거나 기존 필수 CI를 대체하지 않는지 확인한다. */
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { load } from "js-yaml";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const source = read(".github/workflows/expanded-e2e.yml");
const workflow = load(source);
const steps = workflow.jobs.expanded.steps;

test("확장 검증은 예약·수동 실행과 자체 변경 PR에 한정하며 토큰을 읽기 전용으로 둔다", () => {
  assert.ok(workflow.on.schedule[0].cron);
  assert.ok(Object.hasOwn(workflow.on, "workflow_dispatch"));
  assert.deepEqual(workflow.on.pull_request.branches, ["main"]);
  assert.ok(workflow.on.pull_request.paths.includes(".github/workflows/expanded-e2e.yml"));
  assert.ok(!Object.hasOwn(workflow.on, "pull_request_target"));
  assert.deepEqual(workflow.permissions, { contents: "read" });
  assert.doesNotMatch(source, /secrets\.|permissions:\s*write-all|id-token:/);
  assert.equal(workflow.concurrency["cancel-in-progress"], false);
  assert.ok(workflow.jobs.expanded["timeout-minutes"] <= 30);
});

test("운영 환경 파일·비밀값 없이 격리 DB와 Chromium을 준비한다", () => {
  const runs = steps.map(step => step.run ?? "").join("\n");
  assert.match(runs, /HRA_TEST_PG_BIN/);
  assert.match(runs, /playwright install --with-deps chromium/);
  const browserInstall = steps.findIndex(step => step.run === "npx playwright install --with-deps chromium");
  const networkContract = steps.findIndex(step => step.run === "node --test scripts/tests/expanded-*.test.mjs");
  assert.ok(browserInstall >= 0 && networkContract > browserInstall, "실제 canary 검사 전에 브라우저가 설치되어야 한다");
  assert.doesNotMatch(runs, /--env-file|db:push|vercel (?:env|deploy)/);
  const { env: fixtureEnvironment } = workflow.jobs.expanded;
  assert.equal(fixtureEnvironment.DATABASE_URL, "postgresql://ci:ci@127.0.0.1:1/isolated");
  for (const step of steps.filter(step => step.uses?.startsWith("actions/checkout@"))) {
    assert.equal(step.with["persist-credentials"], false);
  }
});

test("수집만 성공한 것으로 끝내지 않고 공개 실행 뒤 G1을 필수 실행한다", () => {
  const command = JSON.parse(read("package.json")).scripts["test:e2e:expanded"];
  assert.match(command, /verify-site-routes\.mjs --browser public/);
  assert.match(command, /&& npm run test:academic-g1$/);
  assert.ok(steps.some(step => step.run === "npm run test:e2e:expanded"));
  const requiredCi = read(".github/workflows/ci.yml");
  for (const command of ["npm run verify:auth-proxy", "npm run verify:editor-preview", "npm run test:academic-g1",
    "npm run test:e2e -- tests/e2e/ci-smoke.spec.ts --list", "npm run test:e2e -- tests/e2e/ci-smoke.spec.ts"]) {
    assert.ok(requiredCi.includes(`run: ${command}`));
  }
});

test("실패 보고서도 사전 검사를 통과한 JSON 한 파일만 짧게 보관한다", () => {
  const upload = steps.find(step => step.uses?.startsWith("actions/upload-artifact@"));
  assert.match(upload.uses, /@[a-f0-9]{40}$/);
  const safety = steps.find(step => step.id === "artifact_safety");
  assert.equal(safety?.if, "always()");
  assert.match(safety?.run ?? "", /check-public-artifact\.mjs --kind expanded-public --file test-results\/expanded-public\.json/);
  assert.equal(upload.if, "always() && steps.artifact_safety.outcome == 'success'");
  assert.equal(upload.with.path, "test-results/expanded-public.json");
  assert.equal(upload.with["retention-days"], 7);
  assert.doesNotMatch(upload.with.path, /\*|trace|video|storage/);
});
