/**
 * 테스트 프로세스의 SDK 네트워크만 loopback 저장소로 전달한다.
 * 허용한 앱·저장소 외 주소는 차단하며 원본 URL·토큰을 오류에 포함하지 않는다.
 */
import { Agent, Dispatcher, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { academicBlobApiOrigin, academicBlobApiPath } from "./academic-private-store.mjs";

function loopbackOrigin(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port || url.pathname !== "/" ||
    url.username || url.password || url.search || url.hash) throw new Error("QA_NETWORK_SCOPE");
  return url.origin;
}
const providerRequest = (url, host) => url.origin === `https://${host}` ||
  (url.origin === academicBlobApiOrigin &&
    (url.pathname === academicBlobApiPath || url.pathname === `${academicBlobApiPath}/` || url.pathname === `${academicBlobApiPath}/delete`));

/** undici의 평탄한 헤더 배열도 복사하며 외부 Host 헤더를 loopback에 재사용하지 않는다. */
function requestHeaders(input) {
  const headers = new Headers();
  if (Array.isArray(input) && (input.length === 0 || typeof input[0] === "string")) {
    for (let index = 0; index < input.length; index += 2) headers.append(input[index], input[index + 1]);
  } else {
    for (const [name, value] of new Headers(input)) headers.append(name, value);
  }
  headers.delete("host");
  headers.delete("x-hra-test-blob-origin");
  return headers;
}

/** 실제 SDK의 fetch·직렬화·스트림을 유지하고 Dispatcher의 목적지만 치환한다. */
export function installAcademicGateNetwork({ appOrigin, storeOrigin, blobHost, onBlocked = () => undefined }) {
  const app = loopbackOrigin(appOrigin), store = loopbackOrigin(storeOrigin);
  if (!/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(blobHost)) throw new Error("QA_NETWORK_SCOPE");
  const original = getGlobalDispatcher(), agent = new Agent();
  const counts = { forwarded: 0, local: 0, blocked: 0 };
  class GateDispatcher extends Dispatcher {
    dispatch(options, handler) {
      let url;
      try { url = new URL(options.path, String(options.origin)); }
      catch { counts.blocked++; onBlocked("INVALID_URL"); handler.onError(new Error("QA_NETWORK_BLOCKED")); return false; }
      if (url.username || url.password || url.hash) {
        counts.blocked++; onBlocked("INVALID_AUTHORITY"); handler.onError(new Error("QA_NETWORK_BLOCKED")); return false;
      }
      if (providerRequest(url, blobHost)) {
        counts.forwarded++;
        const headers = requestHeaders(options.headers);
        headers.set("x-hra-test-blob-origin", url.origin);
        return agent.dispatch({ ...options, origin: store, path: `${url.pathname}${url.search}`,
          headers: [...headers].flat() }, handler);
      }
      if (url.origin === app || url.origin === store) { counts.local++; return agent.dispatch(options, handler); }
      const code = url.hostname === "localhost" ? "LOOPBACK_LOCALHOST" : url.hostname === "127.0.0.1" ? "LOOPBACK_OTHER_PORT"
        : url.hostname === "vercel.com" ? "PROVIDER_API_PATH" : url.hostname.endsWith(".resource-qa.invalid") ? "NEON_UNROUTED"
          : url.hostname.endsWith(".private.blob.vercel-storage.com") ? "BLOB_OTHER_STORE" : "UNKNOWN_HOST";
      counts.blocked++; onBlocked(code); handler.onError(new Error("QA_NETWORK_BLOCKED")); return false;
    }
    close(callback) { return callback ? agent.close(callback) : agent.close(); }
    destroy(error, callback) { return agent.destroy(error, callback); }
  }
  setGlobalDispatcher(new GateDispatcher());
  let restored = false;
  return {
    snapshot: () => ({ ...counts }),
    async close() { if (!restored) { restored = true; setGlobalDispatcher(original); await agent.close(); } },
  };
}

/** 브라우저 SDK PUT을 실제 로컬 HTTP로 보내고 외부 통신을 거부한다. */
export async function routeAcademicBrowserNetwork(context, { appOrigin, browserStoreOrigin, blobHost, onBlocked = () => undefined }) {
  const app = loopbackOrigin(appOrigin), store = new URL(browserStoreOrigin);
  if (store.protocol !== "https:" || store.hostname !== "127.0.0.1" || !store.port || store.pathname !== "/" ||
    store.username || store.password || store.search || store.hash) throw new Error("QA_NETWORK_SCOPE");
  await context.route("**/*", async (route) => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === app) return route.continue();
    if (!providerRequest(url, blobHost)) { onBlocked("BROWSER_EXTERNAL_ORIGIN"); return route.abort("blockedbyclient"); }
    const headers = requestHeaders(await request.allHeaders());
    headers.set("x-hra-test-blob-origin", url.origin);
    // Chromium은 XHR File 본문을 postDataBuffer에 노출하지 않는다. fetch로 복사하지 않고
    // 동일 HTTPS 프로토콜의 loopback으로 원본 브라우저 전송을 그대로 계속한다.
    await route.continue({ url: `${store.origin}${url.pathname}${url.search}`, headers: Object.fromEntries(headers) });
  });
}

/** Playwright API 전송은 route/undici 밖이므로 정확한 앱 주소와 리다이렉트 금지를 직접 강제한다. */
export function academicLocalApi(request, appOrigin) {
  const app = loopbackOrigin(appOrigin);
  const send = (method, value, options = {}) => {
    const url = new URL(value, app);
    if (url.origin !== app || url.username || url.password || url.hash) throw new Error("QA_API_SCOPE");
    return request[method](url.href, { ...options, maxRedirects: 0, maxRetries: 0 });
  };
  return {
    get: (url, options) => send("get", url, options),
    post: (url, options) => send("post", url, options),
    delete: (url, options) => send("delete", url, options),
  };
}
