/**
 * G1 CI 전용 private Blob HTTP 저장소다. 실제 SDK 전송만 이 loopback 서버로 연결한다.
 * 합성 토큰의 서명·경로·만료·크기·MIME을 검사하며 앱 인증/SQL/SDK 함수는 대체하지 않는다.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createSecureServer } from "node:http2";
import { academicGateTls } from "./academic-g1-tls.mjs";

export const academicBlobApiOrigin = "https://vercel.com";
export const academicBlobApiPath = "/api/blob";
export const academicMaximumFileBytes = 52_428_800;
const keyPattern = /^academic-uploads\/v1\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/document\.pdf$/;
const json = (response, status, body) => {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
};
const reject = (response, status = 403, code = "forbidden") => json(response, status, { error: { code, message: "격리 저장소 요청 거부" } });

/** 본문을 상한까지 실제로 읽고 초과·연결 중단은 저장하지 않는다. */
async function readBody(request, maximum) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximum) throw new Error("QA_STORE_BODY_LIMIT");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, length);
}

/** SDK의 실제 클라이언트 토큰 형식을 검사한다. 서명 원문이나 토큰은 출력하지 않는다. */
function clientGrant(token, serverToken, host, key) {
  const prefix = `vercel_blob_client_${host.split(".")[0]}_`;
  if (!token.startsWith(prefix)) return null;
  try {
    const secured = Buffer.from(token.slice(prefix.length), "base64").toString("utf8");
    const separator = secured.indexOf(".");
    const signature = secured.slice(0, separator), encoded = secured.slice(separator + 1);
    const expected = createHmac("sha256", serverToken).update(encoded).digest("hex");
    if (!/^[a-f0-9]{64}$/.test(signature) || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    if (payload.pathname !== key || payload.validUntil <= Date.now() || payload.allowOverwrite !== false ||
      payload.addRandomSuffix !== false || !Number.isInteger(payload.maximumSizeInBytes) ||
      payload.maximumSizeInBytes < 1 || payload.maximumSizeInBytes > academicMaximumFileBytes ||
      !Array.isArray(payload.allowedContentTypes) || payload.allowedContentTypes.length !== 1 ||
      payload.allowedContentTypes[0] !== "application/pdf") return null;
    return payload;
  } catch { return null; }
}

/** 서버는 외부 주소에 바인딩하지 않는다. 제어는 반환한 메서드로만 하고 HTTP 제어 API는 만들지 않는다. */
export async function createAcademicPrivateStore({ host, token, port = 0, browserTls = false }) {
  if (!/^[a-z0-9-]+\.private\.blob\.vercel-storage\.com$/.test(host) ||
    !token.startsWith(`vercel_blob_rw_${host.split(".")[0]}_`)) throw new Error("QA_STORE_CONFIG");
  const objects = new Map(), writes = new Set(), faults = [], pauses = new Set(), counts = { PUT: 0, HEAD: 0, GET: 0, DELETE: 0, denied: 0 };
  const metadata = (key, record) => ({ url: `https://${host}/${key}`, downloadUrl: `https://${host}/${key}?download=1`,
    pathname: key, contentType: "application/pdf", contentDisposition: "attachment", cacheControl: "private, no-store",
    size: record.bytes.length, uploadedAt: record.uploadedAt, etag: record.etag });
  const selectKey = (value) => {
    if (typeof value !== "string") return null;
    if (keyPattern.test(value)) return value;
    try { const url = new URL(value); return url.origin === `https://${host}` && !url.search && !url.hash && keyPattern.test(url.pathname.slice(1)) ? url.pathname.slice(1) : null; }
    catch { return null; }
  };
  const handle = async (request, response) => {
    const source = request.headers["x-hra-test-blob-origin"];
    const url = new URL(request.url, "http://localhost");
    const api = source === academicBlobApiOrigin && (url.pathname === academicBlobApiPath || url.pathname.startsWith(`${academicBlobApiPath}/`));
    if (api && request.method === "OPTIONS") {
      response.writeHead(204, { "Access-Control-Allow-Origin": request.headers.origin ?? "null",
        "Access-Control-Allow-Methods": "PUT, GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": request.headers["access-control-request-headers"] ?? "authorization, content-type" });
      return response.end();
    }
    const privateRead = source === `https://${host}` && request.method === "GET";
    let operation;
    if (api && request.method === "PUT" && /^\/api\/blob\/?$/.test(url.pathname)) operation = "PUT";
    else if (api && request.method === "GET" && /^\/api\/blob\/?$/.test(url.pathname)) operation = "HEAD";
    else if (api && request.method === "POST" && url.pathname === `${academicBlobApiPath}/delete`) operation = "DELETE";
    else if (privateRead) operation = "GET";
    if (!operation) { counts.denied++; request.resume(); return reject(response); }
    counts[operation]++;
    const faultIndex = faults.findIndex((fault) => fault.operation === operation);
    const fault = faultIndex < 0 ? null : faults.splice(faultIndex, 1)[0];
    if (fault?.mode === "forbidden" || fault?.mode === "unavailable") {
      request.resume(); return reject(response, fault.mode === "forbidden" ? 403 : 503,
        fault.mode === "forbidden" ? "forbidden" : "service_unavailable");
    }
    const bearer = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
    if (operation === "PUT") {
      const key = url.searchParams.get("pathname");
      const grant = keyPattern.test(key ?? "") ? clientGrant(bearer, token, host, key) : null;
      if (!grant || request.headers["x-vercel-blob-access"] !== "private" || request.headers["x-content-type"] !== "application/pdf" || objects.has(key) || writes.has(key)) {
        counts.denied++; request.resume(); return reject(response);
      }
      // 본문을 기다리기 전에 키를 예약해 동일 토큰의 동시 PUT도 덮어쓰지 못하게 한다.
      writes.add(key);
      try {
        const bytes = await readBody(request, grant.maximumSizeInBytes);
        if (bytes.length < 1) return reject(response, 400, "file_too_large");
        const record = { bytes, etag: createHash("sha256").update(bytes).digest("hex"), uploadedAt: new Date().toISOString(), grant };
        objects.set(key, record);
        return json(response, 200, metadata(key, record));
      } finally { writes.delete(key); }
    }
    if (bearer !== token) { counts.denied++; request.resume(); return reject(response); }
    if (operation === "DELETE") {
      const body = JSON.parse((await readBody(request, 16_384)).toString("utf8"));
      if (!Array.isArray(body.urls) || body.urls.length !== 1) return reject(response);
      const key = selectKey(body.urls[0]), record = objects.get(key);
      if (!key) return reject(response);
      if (record && request.headers["x-if-match"] !== record.etag) return reject(response, 412, "precondition_failed");
      objects.delete(key);
      return json(response, 200, {});
    }
    const key = operation === "HEAD" ? selectKey(url.searchParams.get("url")) : selectKey(url.pathname.slice(1));
    const record = objects.get(key);
    if (!key || !record) return reject(response, 404, "not_found");
    if (operation === "HEAD") {
      const result = metadata(key, record);
      if (fault?.mode === "wrong-host") result.url = `https://otherstore.private.blob.vercel-storage.com/${key}`;
      if (fault?.mode === "wrong-path") result.pathname = "other.pdf";
      if (fault?.mode === "changed-etag") result.etag = "changed";
      return json(response, 200, result);
    }
    if (fault?.mode === "pause") { fault.started(); await fault.wait; }
    response.writeHead(200, { "Content-Type": "application/pdf", "Content-Length": String(record.bytes.length),
      ETag: fault?.mode === "changed-etag" ? "changed" : record.etag, "Cache-Control": "private, no-store" });
    if (fault?.mode === "truncate") { response.write(record.bytes.subarray(0, Math.max(1, record.bytes.length - 1))); response.destroy(); }
    else response.end(record.bytes);
  };
  const listener = (request, response) => {
    // 브라우저가 원본 File을 직접 전송하므로 preflight/실제 응답의 CORS를 저장소가 처리한다.
    response.setHeader("Access-Control-Allow-Origin", request.headers.origin ?? "null");
    response.setHeader("Access-Control-Allow-Methods", "PUT, GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", request.headers["access-control-request-headers"] ?? "authorization, content-type");
    handle(request, response).catch(() => {
      if (!response.headersSent && !response.destroyed) reject(response, 400, "forbidden");
      else response.destroy();
    });
  };
  const server = createServer(listener);
  // Chromium은 원래 공급자 연결의 HTTP/2 협상을 유지할 수 있어 두 프로토콜을 모두 받는다.
  const browserServer = browserTls ? createSecureServer({ ...academicGateTls(), allowHTTP1: true }, listener) : null;
  const sessions = new Set();
  browserServer?.on("session", session => { sessions.add(session); session.once("close", () => sessions.delete(session)); });
  server.requestTimeout = 30_000;
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error("QA_STORE_PORT");
  await new Promise((resolve, reject_) => { server.once("error", reject_); server.listen(port, "127.0.0.1", resolve); });
  if (browserServer) await new Promise((resolve, reject_) => { browserServer.once("error", reject_); browserServer.listen(0, "127.0.0.1", resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  return {
    origin, host, browserOrigin: browserServer ? `https://127.0.0.1:${browserServer.address().port}` : null,
    snapshot: () => ({ ...counts, objects: objects.size }),
    pauseNextRead() {
      let started = () => { throw new Error("QA_STORE_PAUSE_INIT"); };
      let release = () => { throw new Error("QA_STORE_PAUSE_INIT"); };
      const startedPromise = new Promise((resolve) => { started = resolve; });
      const wait = new Promise((resolve) => { release = () => { resolve(); pauses.delete(release); }; });
      pauses.add(release);
      faults.push({ operation: "GET", mode: "pause", started, wait });
      return { started: startedPromise, release };
    },
    failNext(operation, mode) {
      if (!["PUT", "HEAD", "GET", "DELETE"].includes(operation) ||
        !["forbidden", "unavailable", "truncate", "wrong-host", "wrong-path", "changed-etag"].includes(mode)) throw new Error("QA_STORE_FAULT");
      faults.push({ operation, mode });
    },
    receipt(key) {
      const record = objects.get(key);
      if (!record) throw new Error("QA_STORE_MISSING");
      const body = { type: "blob.upload-completed", payload: { blob: metadata(key, record), tokenPayload: record.grant.onUploadCompleted?.tokenPayload ?? null } };
      return { body, signature: createHmac("sha256", token).update(JSON.stringify(body)).digest("hex") };
    },
    async close() {
      for (const release of pauses) release();
      for (const session of sessions) session.destroy();
      for (const active of [browserServer, server]) {
        if (!active?.listening) continue;
        active.closeAllConnections?.();
        await new Promise((resolve, reject_) => active.close((error) => error ? reject_(new Error("QA_STORE_CLOSE")) : resolve()));
      }
      objects.clear(); faults.length = 0;
    },
  };
}
