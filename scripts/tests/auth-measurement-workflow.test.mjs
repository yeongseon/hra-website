/**
 * 인증 정책의 새 정본을 변경할 때 계측 workflow가 빠지지 않는지 검사합니다.
 * lockfile 변경과 동일 lockfile 비교를 구분하는 운영 분기를 소스 계약으로 고정합니다.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import yaml from "js-yaml";

const workflow = yaml.load(readFileSync(new URL("../../.github/workflows/authentication-measurement.yml", import.meta.url), "utf8"));

test("계약 identity·본인 API 변경은 인증 비용·권한 회수 workflow를 실행한다", () => {
  const paths = workflow.on.pull_request.paths;
  assert.ok(paths.includes("packages/contracts/src/identity.ts"));
  assert.ok(paths.includes("packages/contracts/package.json"));
  assert.ok(paths.includes("src/app/api/v1/me/route.ts"));
  assert.ok(paths.includes("src/features/users/me/*.ts"));
});

test("동일 lockfile만 전후 비교하고 변경 시 단독 검증을 명시한다", () => {
  const step = workflow.jobs.measure.steps.find((entry) => entry.name?.includes("동일 lock이면"));
  assert.ok(step);
  assert.match(step.run, /git merge-base --is-ancestor/);
  assert.match(step.run, /git diff --quiet/);
  assert.match(step.run, /--compare --baseline-ref/);
  assert.match(step.run, /--single --output/);
});
