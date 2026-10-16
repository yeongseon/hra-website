/**
 * 전체 읽기 QA의 next start·HTTP 단계에만 쓰는 유일한 NODE_OPTIONS preload다.
 * DB 전송을 정적 의존성으로 먼저 설치해 다중 --import의 fetch 덮어쓰기를 막는다.
 * 실제 SQL은 기존 전송기의 표식·소켓 검증을 통과한 임시 PostgreSQL에서만 실행된다.
 */
import "./resource-qa-preload.mjs";
import { qaNeonEndpoint } from "./neon-psql-transport.mjs";
import { Socket } from "node:net";
import { join } from "node:path";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";

const databaseFetch = globalThis.fetch;
const appUrl = new URL(process.env.HRA_SITE_ROUTE_ORIGIN ?? process.env.AUTH_URL);
if (appUrl.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(appUrl.hostname) ||
    !appUrl.port || appUrl.username || appUrl.password || appUrl.pathname !== "/" || appUrl.search || appUrl.hash) {
  throw new Error("SITE_ROUTE_ORIGIN_INVALID");
}
const appPort = Number(appUrl.port);
const qaSocket = join(process.env.HRA_RESOURCE_QA_ROOT, `.s.PGSQL.${process.env.PGPORT}`);

/** 원점뿐 아니라 실제 연결도 현재 앱 포트·검증된 PG 소켓 하나로 제한한다. */
function blocked(code) {
  console.error(`SITE_ROUTE_NETWORK:${code}`);
  return new Error(`SITE_ROUTE_${code}`);
}
function isAppUrl(url) {
  return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname) &&
    Number(url.port) === appPort && !url.username && !url.password;
}

// 명시적 undici Agent·dispatcher나 node:http를 사용해도 소켓 경계를 우회하지 못한다.
const socketConnect = Socket.prototype.connect;
Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args;
  const first = values[0];
  let options;
  if (first !== null && typeof first === "object") options = { ...first };
  else if (typeof first === "string" && !/^\d+$/.test(first)) options = { path: first };
  else options = { port: first, host: typeof values[1] === "string" ? values[1] : "localhost" };
  if (options.path !== undefined) {
    if (options.path !== qaSocket) throw blocked("SOCKET_BLOCKED");
  } else {
    if (Number(options.port) !== appPort || !["localhost", "127.0.0.1"].includes(options.host ?? "localhost")) {
      throw blocked("SOCKET_BLOCKED");
    }
    // 사용자 lookup 함수나 hosts 설정이 허용된 localhost를 외부 IP로 바꾸지 못하게 한다.
    options.host = "127.0.0.1";
    delete options.lookup;
  }
  const callback = values.findLast(value => typeof value === "function");
  return callback ? socketConnect.call(this, options, callback) : socketConnect.call(this, options);
};

// @vercel/blob은 global fetch 대신 undici.fetch를 직접 import한다.
// 공용 dispatcher에서도 원점을 검사하고, 직접 Agent 사용은 위 소켓 경계가 처리한다.
const dispatcher = getGlobalDispatcher();
setGlobalDispatcher({
  dispatch(options, handler) {
    let allowed = false;
    try { allowed = isAppUrl(new URL(options.origin)); }
    catch { allowed = false; }
    if (!allowed) { handler.onError(blocked("UNDICI_REQUEST_BLOCKED")); return false; }
    return dispatcher.dispatch(options, handler);
  },
  close: (...args) => dispatcher.close(...args),
  destroy: (...args) => dispatcher.destroy(...args),
});

/** 외부 DB·Blob·OAuth 요청을 보내지 않고, 오류 원문도 바깥으로 전파하지 않는다. */
globalThis.fetch = async (input, options) => {
  let url;
  try {
    url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  } catch {
    throw new Error("SITE_ROUTE_INVALID_REQUEST");
  }
  if (url.href !== qaNeonEndpoint && !isAppUrl(url)) {
    throw blocked("EXTERNAL_REQUEST_BLOCKED");
  }
  try {
    return await databaseFetch(input, options);
  } catch {
    // 원본 예외의 URL·SQL·연결 정보를 공급자/프레임워크 로거로 넘기지 않는다.
    console.error("SITE_ROUTE_NETWORK:FETCH_REJECTED");
    throw new Error("SITE_ROUTE_FETCH_REJECTED");
  }
};
