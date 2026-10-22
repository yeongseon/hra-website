/**
 * 인증 비용 측정 전용 preload입니다. 기존 네트워크·DB 격리를 먼저 적용합니다.
 * 드라이버는 요청을 직렬 실행하며 문맥 파일은 원자적으로 교체합니다.
 */
import "./site-route-preload.mjs";
import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { qaNeonEndpoint } from "./neon-psql-transport.mjs";
import {
  assertAuthMeasurementSources, authMeasurementPhase, authMeasurementStack, classifyAuthDatabaseQuery, installAuthRequestObserver,
} from "./auth-measurement-core.mjs";

// preload 파일의 위치가 아닌 드라이버가 실행한 측정 대상 빌드를 검증합니다.
const repository = process.cwd();
const { nextVersion } = assertAuthMeasurementSources(repository);
const qaRoot = process.env.HRA_RESOURCE_QA_ROOT;
const origin = process.env.HRA_SITE_ROUTE_ORIGIN;
if (!qaRoot || !origin) throw new Error("AUTH_MEASUREMENT_FAILED");
const contextFile = join(qaRoot, "auth-measurement-context.json");
const eventsFile = join(qaRoot, "auth-measurement-events.jsonl");

/** 파일 오류에 경로나 원본 값이 포함되지 않도록 고정 오류만 전파합니다. */
function failed() {
  console.error("AUTH_MEASUREMENT_FAILED");
  throw new Error("AUTH_MEASUREMENT_FAILED");
}
/** 요청 시작 시점의 합성 표식만 복사하며 warmup은 기록하지 않습니다. */
function context() {
  try {
    const value = JSON.parse(readFileSync(contextFile, "utf8"));
    if (!Number.isInteger(value.sampleKey) || value.sampleKey < 0 || value.sampleKey > 100000 ||
        !["RSC", "ACTION", "ROUTE", "LOGIN"].includes(value.hint) ||
        Object.keys(value).some((key) => !["sampleKey", "hint"].includes(key))) return failed();
    return { sampleKey: value.sampleKey, hint: value.hint };
  } catch { return failed(); }
}
/** 허용된 필드만 생성한 호출부의 이벤트를 한 줄로 저장합니다. */
function append(event) {
  if (!event.sampleKey) return;
  try { appendFileSync(eventsFile, `${JSON.stringify(event)}\n`, { mode: 0o600 }); }
  catch { failed(); }
}
installAuthRequestObserver({ origin, onAuth({ stack }) {
  const snapshot = context();
  append({ sampleKey: snapshot.sampleKey, type: "auth", phase: authMeasurementPhase({ ...snapshot, stack, nextVersion }),
    durationMs: 0, failed: false });
} });

// 이전 fetch가 검증·실행하는 Neon HTTP 요청 단위로 정확히 한 번만 기록합니다.
const databaseFetch = globalThis.fetch;
globalThis.fetch = async (input, options) => {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const method = (options?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (url !== qaNeonEndpoint || method !== "POST") return databaseFetch(input, options);
  const snapshot = context();
  const phase = authMeasurementPhase({ ...snapshot, stack: authMeasurementStack(), nextVersion });
  let dbKind = "other";
  try {
    const body = options?.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof body === "string") dbKind = classifyAuthDatabaseQuery(JSON.parse(body));
  } catch { failed(); }
  const started = performance.now();
  let requestFailed = true;
  try {
    const response = await databaseFetch(input, options);
    requestFailed = !response.ok;
    return response;
  } finally {
    append({ sampleKey: snapshot.sampleKey, type: "db", phase,
      durationMs: Math.max(0, performance.now() - started), failed: requestFailed, dbKind });
  }
};
