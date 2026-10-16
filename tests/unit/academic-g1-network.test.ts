// @vitest-environment node
/** 실제 Playwright API 전송이 미허용 리다이렉트 목적지에 도달하지 않는지 확인한다. */
import { createServer, type Server } from "node:http";
import { request } from "@playwright/test";
import { expect, it } from "vitest";
import { academicLocalApi } from "../support/academic-g1-network.mjs";

/** loopback 서버의 주소만 반환하고 외부 주소로 바인딩하지 않는다. */
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("QA_TEST_PORT");
  return `http://127.0.0.1:${address.port}`;
}
async function close(server: Server) {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

it("정확 앱 URL만 허용하고 GET·POST·DELETE의 리다이렉트를 따라가지 않는다", async () => {
  let forbiddenHits = 0;
  const forbidden = createServer((_req, res) => { forbiddenHits++; res.end("도달 금지"); });
  const forbiddenOrigin = await listen(forbidden);
  const allowed = createServer((_req, res) => { res.writeHead(302, { Location: forbiddenOrigin }); res.end(); });
  const origin = await listen(allowed), context = await request.newContext();
  try {
    const api = academicLocalApi(context, origin);
    for (const method of ["get", "post", "delete"] as const) {
      expect((await api[method]("/redirect", { maxRedirects: 10 })).status()).toBe(302);
      expect(() => api[method](forbiddenOrigin)).toThrow("QA_API_SCOPE");
    }
    expect(() => api.get(`http://user@127.0.0.1:${new URL(origin).port}`)).toThrow("QA_API_SCOPE");
    expect(() => api.get("/redirect#fragment")).toThrow("QA_API_SCOPE");
    expect(forbiddenHits).toBe(0);
  } finally { await context.dispose(); await close(allowed); await close(forbidden); }
});
