/** 미완료 응답 때문에 정상 Agent close가 대기해도 소유 연결을 강제 정리할 수 있어야 한다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { fetch } from "undici";
import { installAcademicGateNetwork } from "../../tests/support/academic-g1-network.mjs";

test("열린 합성 응답의 정상 close 대기 뒤 destroy가 연결을 끝낸다", { timeout: 10000 }, async () => {
  const server = createServer((_request, response) => { response.writeHead(200); response.write("synthetic"); });
  const sockets = new Set();
  let peerEnded = 0;
  server.on("connection", socket => { sockets.add(socket); socket.once("end", () => { peerEnded++; }); socket.once("close", () => sockets.delete(socket)); });
  let network, reader;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    network = installAcademicGateNetwork({ appOrigin: origin, storeOrigin: origin, blobHost: "cleanupqa.private.blob.vercel-storage.com" });
    // 일반 앱 요청은 원래 dispatcher 소유다. 이 검사는 직접 소유하는 공급자 전송 Agent를 사용한다.
    const response = await fetch("https://cleanupqa.private.blob.vercel-storage.com/held", { signal: AbortSignal.timeout(3000) });
    reader = response.body.getReader();
    await reader.read();
    let closed = false;
    const closing = network.close().then(() => { closed = true; }).catch(() => { closed = true; });
    await delay(50);
    assert.equal(closed, false);
    assert.equal(network.snapshot().forwarded, 1);
    assert.equal(sockets.size, 1);
    await network.destroy();
    const deadline = Date.now() + 1000;
    while (!peerEnded && sockets.size && Date.now() < deadline) await delay(10);
    assert.ok(peerEnded > 0 || sockets.size === 0);
    // 강제 destroy 뒤 정상 close Promise의 상태와 무관하게 실제 소켓 소멸을 증명한다.
    void closing;
    assert.equal(network.snapshot().blocked, 0);
  } finally {
    void reader?.cancel().catch(() => undefined);
    server.closeAllConnections();
    await network?.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
