// @vitest-environment node
/** 실제 설치 SDK·서명 토큰·HTTP 원본 읽기·전송 차단을 production 코드 교체 없이 검증한다. */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "node:http2";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { del, get, head } from "@vercel/blob";
import { handleUpload, put } from "@vercel/blob/client";
import { createAcademicPrivateStore } from "../support/academic-private-store.mjs";
import { installAcademicGateNetwork } from "../support/academic-g1-network.mjs";

const host = "academicg1qa.private.blob.vercel-storage.com";
const token = "vercel_blob_rw_academicg1qa_synthetic-only";
let store: Awaited<ReturnType<typeof createAcademicPrivateStore>>;
let network: ReturnType<typeof installAcademicGateNetwork>;
const bytes = Buffer.from("%PDF-1.7\n비민감 시험\n%%EOF");
const key = () => `academic-uploads/v1/${randomUUID()}/document.pdf`;
async function grant(pathname: string, maximumSizeInBytes = bytes.length) {
  const result = await handleUpload({ token, request: new Request("http://127.0.0.1:3100/api/academic/uploads"),
    body: { type: "blob.generate-client-token", payload: { pathname, multipart: false, clientPayload: null } },
    onBeforeGenerateToken: async () => ({ allowedContentTypes: ["application/pdf"], maximumSizeInBytes,
      validUntil: Date.now() + 60_000, addRandomSuffix: false, allowOverwrite: false }),
  });
  if (!("clientToken" in result)) throw new Error("QA_CLIENT_GRANT");
  return result.clientToken;
}
beforeEach(async () => {
  vi.stubEnv("VERCEL_BLOB_RETRIES", "0");
  store = await createAcademicPrivateStore({ host, token });
  network = installAcademicGateNetwork({ appOrigin: "http://127.0.0.1:3100", storeOrigin: store.origin, blobHost: host });
});
afterEach(async () => { await network?.close(); await store?.close(); vi.unstubAllEnvs(); });

it("실제 SDK 클라이언트 토큰→PUT→head→private get→조건부 del을 로컬 HTTP에서 수행한다", async () => {
  const path = key();
  const uploaded = await put(path, bytes, { access: "private", token: await grant(path), contentType: "application/pdf", multipart: false });
  expect(uploaded.pathname).toBe(path);
  const metadata = await head(path, { token });
  expect(metadata.size).toBe(bytes.length);
  const result = await get(path, { access: "private", token, useCache: false });
  expect(result?.statusCode).toBe(200);
  expect(Buffer.from(await new Response(result?.stream).arrayBuffer())).toEqual(bytes);
  expect((await fetch(`https://${host}/${path}`)).status).toBe(403);
  await del(path, { token, ifMatch: metadata.etag });
  expect(await get(path, { access: "private", token })).toBeNull();
  expect(store.snapshot()).toMatchObject({ PUT: 1, HEAD: 1, GET: 3, DELETE: 1, objects: 0 });
  expect(network.snapshot()).toMatchObject({ blocked: 0, forwarded: 6 });
});

it("변조 토큰·다른 경로·덮어쓰기·잘못된 ETag를 거부한다", async () => {
  const path = key(), clientToken = await grant(path);
  const prefix = "vercel_blob_client_academicg1qa_";
  const secured = Buffer.from(clientToken.slice(prefix.length), "base64").toString("utf8");
  const tampered = prefix + Buffer.from(`${secured[0] === "0" ? "1" : "0"}${secured.slice(1)}`).toString("base64");
  await expect(put(path, bytes, { access: "private", token: tampered, contentType: "application/pdf" })).rejects.toThrow();
  await expect(put(key(), bytes, { access: "private", token: clientToken, contentType: "application/pdf" })).rejects.toThrow();
  await put(path, bytes, { access: "private", token: clientToken, contentType: "application/pdf" });
  await expect(put(path, bytes, { access: "private", token: clientToken, contentType: "application/pdf" })).rejects.toThrow();
  await expect(del(path, { token, ifMatch: "wrong" })).rejects.toThrow();
  expect(store.snapshot().objects).toBe(1);
});

it("원본 읽기 장애·메타 위장 주입을 실제 SDK 응답에서 관찰한다", async () => {
  const path = key();
  await put(path, bytes, { access: "private", token: await grant(path), contentType: "application/pdf" });
  store.failNext("HEAD", "wrong-host");
  expect(new URL((await head(path, { token })).url).hostname).not.toBe(host);
  store.failNext("GET", "unavailable");
  await expect(get(path, { access: "private", token })).rejects.toThrow();
  expect(store.snapshot().objects).toBe(1);
});

it("같은 토큰·키의 실제 SDK 동시 PUT은 한 건만 저장한다", async () => {
  const path = key(), clientToken = await grant(path, 1_048_576);
  const stream = () => new ReadableStream<Uint8Array>({ async start(controller) {
    controller.enqueue(Buffer.alloc(524_288));
    await delay(100);
    controller.enqueue(Buffer.alloc(524_288)); controller.close();
  } });
  const results = await Promise.allSettled([1, 2].map(() => put(path, stream(), {
    access: "private", token: clientToken, contentType: "application/pdf",
  })));
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  expect((await head(path, { token })).size).toBe(1_048_576);
  expect(store.snapshot().objects).toBe(1);
});

it("허용되지 않은 외부 요청은 실제 DNS나 네트워크에 전달하지 않는다", async () => {
  await expect(fetch("https://outside.invalid/private")).rejects.toThrow();
  await expect(fetch("https://vercel.com/api/other")).rejects.toThrow();
  await expect(fetch("https://otherstore.private.blob.vercel-storage.com/private")).rejects.toThrow();
  expect(network.snapshot().blocked).toBe(3);
  expect(store.snapshot()).toMatchObject({ PUT: 0, HEAD: 0, GET: 0, DELETE: 0 });
});

it("일회성 HTTPS 저장소는 Chromium의 HTTP/2 협상과 원본 PUT을 처리한다", async () => {
  const secure = await createAcademicPrivateStore({ host, token, browserTls: true });
  if (!secure.browserOrigin) throw new Error("QA_BROWSER_TLS");
  const session = connect(secure.browserOrigin, { rejectUnauthorized: false });
  try {
    const path = key(), clientToken = await grant(path);
    const result = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const request = session.request({ ":method": "PUT", ":path": `/api/blob?pathname=${encodeURIComponent(path)}`,
        "x-hra-test-blob-origin": "https://vercel.com", "x-content-type": "application/pdf",
        "x-vercel-blob-access": "private", authorization: `Bearer ${clientToken}` });
      let status = 0, body = "";
      request.on("response", headers => { status = Number(headers[":status"]); });
      request.setEncoding("utf8"); request.on("data", value => { body += value; });
      request.on("error", reject); request.on("end", () => resolve({ status, body })); request.end(bytes);
    });
    expect(result.status).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ pathname: path, size: bytes.length });
    expect(secure.snapshot()).toMatchObject({ PUT: 1, objects: 1 });
  } finally { session.destroy(); await secure.close(); }
});

it("실제 SDK로 정확히 50MiB를 전송하고 원본 스트림을 읽으며 초과 본문은 저장하지 않는다", async () => {
  const maximum = 52_428_800, path = key(), body = Buffer.alloc(maximum);
  body.write("%PDF-1.7\n");
  await put(path, body, { access: "private", token: await grant(path, maximum), contentType: "application/pdf" });
  expect((await head(path, { token })).size).toBe(maximum);
  const result = await get(path, { access: "private", token, useCache: false });
  expect((await new Response(result?.stream).arrayBuffer()).byteLength).toBe(maximum);
  const oversized = key();
  await expect(put(oversized, Buffer.alloc(maximum + 1), { access: "private", token: await grant(oversized, maximum), contentType: "application/pdf" })).rejects.toThrow();
  expect(store.snapshot().objects).toBe(1);
}, 30_000);
