/** 운영 점검 workflow의 실행 대상·권한·실패 전파·보고서 범위를 내장 기능만으로 검사한다. */
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { test } from "node:test";

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const source = read(".github/workflows/production-smoke.yml");
const repository = new URL("../../", import.meta.url);

test("성공한 Production 배포·예약·수동 실행을 구분하고 PR은 합성 계약만 검사한다", () => {
  assert.match(source, /^  deployment_status:/m);
  assert.match(source, /cron: "17 \* \* \* \*"/);
  assert.match(source, /github\.event\.deployment_status\.state == 'success'/);
  assert.match(source, /github\.event\.deployment\.environment == 'Production'/);
  assert.match(source, /if: github\.event_name != 'pull_request'/);
  assert.match(source, /needs: contract/);
  assert.doesNotMatch(source, /pull_request_target|secrets\.|--env-file|HEALTH_CHECK_SECRET|db:push/);
});

test("배포 SHA는 셸 코드 대신 환경으로 전달하고 점검은 기본 Production 원점을 사용한다", () => {
  assert.match(source, /SMOKE_SOURCE_SHA: \$\{\{ github\.event\.deployment\.sha \|\| github\.sha \}\}/);
  assert.match(source, /--sha "\$SMOKE_SOURCE_SHA" --sha-kind "\$SMOKE_SHA_KIND"/);
  const live = source.split("- name: 공개 Production HTTP 점검")[1].split("- name:")[0];
  assert.doesNotMatch(live, /--fixture|--fixture-origin|\$\{\{/);
});

test("합성 실패 모드는 기본 비활성이며 실제 실패 상태를 성공으로 바꾸지 않는다", () => {
  assert.match(source, /fixture_alert:[\s\S]*?type: boolean[\s\S]*?default: false/);
  assert.match(source, /run-name:.*합성 알림 경로 검증 — 의도된 실패/);
  assert.match(source, /if: inputs\.fixture_alert == true/);
  assert.match(source, /verify-production-smoke-fixture\.mjs --sha "\$SMOKE_SOURCE_SHA"/);
  assert.doesNotMatch(source, /continue-on-error|\|\| true/);
});

test("읽기 토큰·고정 Action·인증 미보존과 JSON 한 파일 보관을 유지한다", () => {
  assert.match(source, /^permissions:\n  contents: read\n/m);
  assert.equal([...source.matchAll(/^\s*permissions:/gm)].length, 1);
  for (const match of source.matchAll(/uses: (\S+)/g)) assert.match(match[1], /^actions\/(?:checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
  assert.equal([...source.matchAll(/uses: actions\/checkout@/g)].length, [...source.matchAll(/persist-credentials: false/g)].length);
  assert.match(source, /if: always\(\)[\s\S]*?path: test-results\/production-smoke\.json\n/);
  assert.match(source, /retention-days: 7/);
  assert.doesNotMatch(source, /path:.*(?:\*|trace|storage|\.env)/);
  assert.match(source, /group: production-smoke\n      cancel-in-progress: false/);
});

test("실제 합성 실행기는 운영 접속 없이 503 보고서·요약·실패 상태를 남긴다", { timeout: 60_000 }, () => {
  const root = mkdtempSync(join(tmpdir(), "production-alert-contract-"));
  const summaryPath = join(root, "summary.md");
  try {
    // 실행기 자체가 서버를 띄우므로 상위 Node 이벤트 루프의 동기 대기는 서버를 막지 않는다.
    const result = spawnSync(process.execPath, ["scripts/verify-production-smoke-fixture.mjs", "--sha", "a".repeat(40), "--output", join(root, "report.json")], {
      cwd: repository, encoding: "utf8", timeout: 50_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, GITHUB_STEP_SUMMARY: summaryPath },
    });
    assert.equal(result.status, 1, "합성 오류는 실제 Actions failure로 전파해야 한다");
    assert.equal(result.stdout.trim(), "SMOKE_FIXTURE_EXPECTED_FAILURE");
    assert.equal(result.stderr, "");
    const summary = readFileSync(summaryPath, "utf8");
    assert.match(summary, /합성 알림 경로 검증 — 의도된 실패/);
    assert.match(summary, /환경: fixture/);
    assert.match(summary, /HTTP_STATUS/);
    assert.match(summary, /운영 담당자 조치 절차/);
    const missingSummary = spawnSync(process.execPath, ["scripts/verify-production-smoke-fixture.mjs", "--sha", "a".repeat(40), "--output", join(root, "missing-summary.json")], {
      cwd: repository, encoding: "utf8", timeout: 50_000,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    });
    assert.equal(missingSummary.status, 1);
    assert.equal(missingSummary.stdout, "", "요약 경로가 없으면 알림 경로를 검증했다고 출력하지 않는다");
    assert.equal(missingSummary.stderr.trim(), "SMOKE_FIXTURE_FAILED");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
