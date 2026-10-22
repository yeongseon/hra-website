/** 인증 측정 원본 이벤트를 엄격히 검사하고 식별자 없는 집계만 반환합니다. */
export const authMeasurementScenarios = ["credentials", "anonymous_public", "anonymous_protected", "member_page", "admin_page", "approver_page", "academic_gate", "faculty_action", "population_1", "population_25", "population_100", "population_200"];
export const authMeasurementPhases = ["PROXY", "RSC", "ACTION", "ROUTE", "LOGIN"];
const fail = () => { throw new Error("AUTH_MEASURE_EVENT_INVALID"); };
/** 최근접 순위 분위수를 사용하여 표본 하나와 작은 표본도 결정적으로 계산합니다. */
export function quantile(values, fraction) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}
/** 허용 필드 외의 SQL·URL·식별자 등이 섞이면 집계 전 즉시 거부합니다. */
export function validateMeasurementEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) fail();
  const keys = ["sampleKey", "type", "phase", "durationMs", "failed", ...(event.type === "db" ? ["dbKind"] : [])];
  if (Object.keys(event).length !== keys.length || Object.keys(event).some(key => !keys.includes(key)) ||
      !Number.isInteger(event.sampleKey) || event.sampleKey < 1 || event.sampleKey > 100000 ||
      !["auth", "db"].includes(event.type) || !authMeasurementPhases.includes(event.phase) ||
      !Number.isFinite(event.durationMs) || event.durationMs < 0 || typeof event.failed !== "boolean" ||
      event.type === "db" && !["rate_limit", "credentials", "session", "other"].includes(event.dbKind)) fail();
  return event;
}
/** 요청 단위 내부 표식은 결과에서 제거하고 고정 시나리오·실행 단계별 수치만 공개합니다. */
export function summarizeMeasurements(samples, rawEvents) {
  const events = rawEvents.map(validateMeasurementEvent);
  const seen = new Set();
  for (const sample of samples) {
    if (!sample || Object.keys(sample).sort().join() !== "durationMs,sampleKey,scenario" ||
        !authMeasurementScenarios.includes(sample.scenario) || !Number.isInteger(sample.sampleKey) ||
        sample.sampleKey < 1 || seen.has(sample.sampleKey) || !Number.isFinite(sample.durationMs) || sample.durationMs < 0) fail();
    seen.add(sample.sampleKey);
  }
  if (events.some(event => !seen.has(event.sampleKey))) fail();
  return authMeasurementScenarios.filter(scenario => samples.some(sample => sample.scenario === scenario)).map(scenario => {
    const group = samples.filter(sample => sample.scenario === scenario);
    const ids = new Set(group.map(sample => sample.sampleKey));
    const selected = events.filter(event => ids.has(event.sampleKey));
    const database = selected.filter(event => event.type === "db");
    const counts = type => group.map(sample => selected.filter(event => event.sampleKey === sample.sampleKey && event.type === type).length);
    return { scenario, requests: group.length,
      httpMs: { p50: quantile(group.map(sample => sample.durationMs), .5), p95: quantile(group.map(sample => sample.durationMs), .95) },
      authCalls: { total: counts("auth").reduce((a,b) => a+b, 0), p50: quantile(counts("auth"), .5), p95: quantile(counts("auth"), .95) },
      databaseRoundtrips: { total: database.length, p50: quantile(counts("db"), .5), p95: quantile(counts("db"), .95),
        errorCount: database.filter(event => event.failed).length, errorRate: database.length ? database.filter(event => event.failed).length / database.length : 0,
        durationMs: { p50: quantile(database.map(event => event.durationMs), .5), p95: quantile(database.map(event => event.durationMs), .95) },
        kinds: Object.fromEntries(["rate_limit", "credentials", "session", "other"].map(kind => [kind, database.filter(event => event.dbKind === kind).length])) },
      phases: Object.fromEntries(authMeasurementPhases.map(phase => [phase, { auth: selected.filter(event => event.type === "auth" && event.phase === phase).length, db: selected.filter(event => event.type === "db" && event.phase === phase).length }])) };
  });
}
