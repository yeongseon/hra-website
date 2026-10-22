/**
 * 인증 비용 QA의 관측 지점을 검증하고 민감정보 없이 호출·실행 단계를 판별합니다.
 * 운영 모듈을 변경하거나 Next 내부 모듈을 조기에 실행하지 않습니다.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** 설치된 소스와 빌드의 관측 계약이 바뀌면 추정치 대신 명시적으로 실패합니다. */
export function assertAuthMeasurementSources(repository) {
  const read = (path) => readFileSync(join(repository, path), "utf8");
  try {
    const nextVersion = JSON.parse(read("node_modules/next/package.json")).version;
    const authVersion = JSON.parse(read("node_modules/next-auth/package.json")).version;
    const auth = read("node_modules/next-auth/lib/index.js");
    const storage = read("node_modules/next/dist/server/app-render/async-local-storage.js");
    const instance = read("node_modules/next/dist/server/app-render/work-unit-async-storage-instance.js");
    const middleware = read(".next/server/middleware.js");
    // 비압축 원본의 getSession은 정확히 한 개의 cookie 전용 Request를 구성해야 합니다.
    const session = auth.match(/async function getSession\(headers, config\) \{([\s\S]*?)\n\}/)?.[1];
    if (!session || (session.match(/new Request\(/g) ?? []).length !== 1 ||
        !/createActionURL\("session",/.test(session) ||
        !/new Request\(url,\s*\{\s*headers:\s*\{ cookie: headers\.get\("cookie"\) \?\? "" \},?\s*\}\)/.test(session) ||
        !instance.includes("getOrCreateGlobalAsyncLocalStorage)('work-unit-async-storage')") ||
        !storage.includes('Symbol.for(`@next/${name}@${"' + nextVersion + '"}`)') ||
        !/new Request\([^;\n]{0,250}\("session",[^;\n]{0,250}\),\{headers:\{cookie:([\w$]+)\.get\("cookie"\)\?\?""\}\}\)/.test(middleware)) {
      throw new Error("관측 계약 불일치");
    }
    return { nextVersion, authVersion };
  } catch {
    throw new Error("AUTH_MEASUREMENT_SOURCE_MISMATCH");
  }
}

/** 원본 생성자·서브클래스·clone 동작을 유지하며 검증된 getSession 입력만 셉니다. */
export function installAuthRequestObserver({ origin, onAuth }) {
  const expectedOrigin = new URL(origin).origin;
  const original = globalThis.Request;
  const observed = new Proxy(original, {
    construct(target, args, newTarget) {
      const request = Reflect.construct(target, args, newTarget);
      const [input, init] = args;
      if ((typeof input === "string" || input instanceof URL) && init &&
          Reflect.ownKeys(init).length === 1 && Object.hasOwn(init, "headers") &&
          init.headers && Object.getPrototypeOf(init.headers) === Object.prototype &&
          Reflect.ownKeys(init.headers).length === 1 && Object.hasOwn(init.headers, "cookie") &&
          typeof init.headers.cookie === "string") {
        const url = new URL(request.url);
        if (url.origin === expectedOrigin && url.pathname === "/api/auth/session" && !url.search && !url.hash) {
          onAuth({ stack: authMeasurementStack() });
        }
      }
      return request;
    },
  });
  globalThis.Request = observed;
  return () => { if (globalThis.Request === observed) globalThis.Request = original; };
}

/** 깊은 인증 콜백에서도 프록시 파일 근거를 찾고, 스택 설정은 동기 구간에서 즉시 복구합니다. */
export function authMeasurementStack() {
  const previous = Error.stackTraceLimit;
  try {
    Error.stackTraceLimit = 100;
    return new Error().stack ?? "";
  } finally {
    Error.stackTraceLimit = previous;
  }
}

/** 프록시 스택을 우선하고, 일반 서버 실행에서는 이미 생성된 전역 저장소만 읽습니다. */
export function authMeasurementPhase({ hint, stack = "", nextVersion }) {
  if (/(?:middleware|proxy)\.js(?::|\b)/.test(stack)) return "PROXY";
  if (hint === "LOGIN" || hint === "ROUTE") return hint;
  const phase = globalThis[Symbol.for(`@next/work-unit-async-storage@${nextVersion}`)]?.getStore()?.phase;
  if (phase === "action") return "ACTION";
  if (phase === "render") return "RSC";
  return "UNKNOWN";
}

/** SQL·매개변수는 반환하지 않고 고정된 컬럼 이름으로만 비용 종류를 분류합니다. */
export function classifyAuthDatabaseQuery(payload) {
  const query = typeof payload?.query === "string" ? payload.query : "";
  if (/\b(?:reserve_)?rate_limit(?:_\w+)?\b/i.test(query)) return "rate_limit";
  if (/\bpassword_hash\b/i.test(query)) return "credentials";
  if (/\bsession_version\b/i.test(query)) return "session";
  return "other";
}
