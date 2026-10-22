/** 인증 집계의 산술과 민감정보 차단 계약을 독립적으로 검사합니다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { quantile, summarizeMeasurements, validateMeasurementEvent } from "../../tests/support/auth-measurement-stats.mjs";
const event = { sampleKey: 1, type: "db", phase: "RSC", durationMs: 7, failed: true, dbKind: "session" };
test("분위수와 요청별 합계·DB 오류 비율을 계산한다", () => {
  assert.equal(quantile([9,1,3,7], .5), 3);
  assert.equal(quantile([9,1,3,7], .95), 9);
  const [summary] = summarizeMeasurements([{ sampleKey: 1, scenario: "member_page", durationMs: 20 }, { sampleKey: 2, scenario: "member_page", durationMs: 40 }], [event, { ...event, sampleKey: 2, failed: false }]);
  assert.equal(summary.databaseRoundtrips.total, 2);
  assert.equal(summary.databaseRoundtrips.errorRate, .5);
  assert.equal(summary.httpMs.p95, 40);
  assert.equal(summary.phases.RSC.db, 2);
  assert.ok(!JSON.stringify(summary).includes("sampleKey"));
});
test("추가 SQL·URL·계정 필드와 알 수 없는 실행 단계를 거부한다", () => {
  for (const extra of [{ sql: "secret" }, { url: "secret" }, { email: "secret" }, { cookie: "secret" }, { phase: "UNKNOWN" }]) assert.throws(() => validateMeasurementEvent({ ...event, ...extra }), /AUTH_MEASURE_EVENT_INVALID/);
  assert.throws(() => summarizeMeasurements([{ sampleKey: 1, scenario: "secret", durationMs: 1 }], []));
  assert.throws(() => summarizeMeasurements([], [event]));
});
