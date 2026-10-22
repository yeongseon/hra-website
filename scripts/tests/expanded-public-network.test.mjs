/**
 * 실제 Chromium과 공개 TS 픽스처로 외부 통신 차단을 검증한다.
 * 두 폐기 가능한 루프백 서버만 사용하고 요청·오류·브라우저 원문은 출력하지 않는다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repository = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));

/** 업그레이드 연결까지 추적하여 테스트 종료 시 서버 리소스를 모두 닫는다. */
async function startServer(handler, onUpgrade = () => {}) {
  const sockets = new Set();
  const server = http.createServer(handler);
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (_request, socket) => { onUpgrade(); socket.destroy(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object", "NETWORK_SERVER_ADDRESS");
  return {
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

/** Linux 실행 프로세스 그룹 전체를 유한 시간 안에 정리한다. */
function signalGroup(child, signal) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, signal); }
  catch (error) { if (error.code !== "ESRCH") throw new Error("NETWORK_PROCESS_CLEANUP"); }
}

/** 자식 원문은 메모리 안에서만 JSON으로 파싱하고 상위 테스트 출력에 전달하지 않는다. */
async function runBrowser(configPath, origin) {
  const child = spawn(process.execPath, [path.join(repository, "node_modules/@playwright/test/cli.js"), "test", "--config", configPath], {
    cwd: repository, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: {
      PATH: process.env.PATH, HOME: process.env.HOME,
      NODE_OPTIONS: "", HRA_PUBLIC_E2E_ORIGIN: origin,
    },
  });
  let output = "";
  let overflow = false;
  let expired = false;
  let forceTimer;
  // 실패·중단 시에도 Chromium 하위 프로세스가 남지 않도록 그룹 단위로 종료한다.
  const terminate = () => {
    signalGroup(child, "SIGTERM");
    forceTimer = setTimeout(() => signalGroup(child, "SIGKILL"), 2_000);
  };
  const timer = setTimeout(() => { expired = true; terminate(); }, 60_000);
  child.stdout.on("data", (chunk) => {
    if (output.length + chunk.length <= 4_000_000) output += chunk.toString("utf8");
    else if (!overflow) { overflow = true; terminate(); }
  });
  child.stderr.on("data", () => { /* 경로·네트워크 오류 원문은 보관하거나 출력하지 않는다. */ });
  try {
    const exit = await new Promise((resolve, reject) => {
      child.once("error", () => reject(new Error("NETWORK_PROCESS_START")));
      child.once("close", (code) => resolve(code));
    });
    assert.equal(expired, false, "NETWORK_PROCESS_TIMEOUT");
    assert.equal(overflow, false, "NETWORK_REPORT_LIMIT");
    assert.equal(exit, 1, "NETWORK_GUARD_EXIT");
    let report;
    try { report = JSON.parse(output); } catch { throw new Error("NETWORK_REPORT_JSON"); }
    return report;
  } finally {
    clearTimeout(timer);
    clearTimeout(forceTimer);
    signalGroup(child, "SIGKILL");
  }
}

/** 네트워크 차단 실패는 실행 결과와 독립 서버 카운터 두 가지로 확인한다. */
test("공개 브라우저는 외부 HTTP·리디렉션·WebSocket에 연결하지 않는다", { timeout: 90_000 }, async () => {
  let canaryRequests = 0;
  let canaryUpgrades = 0;
  let root;
  let canary;
  let app;
  try {
    root = await mkdtemp(path.join(tmpdir(), "public-network-"));
    canary = await startServer((_request, response) => {
      canaryRequests += 1;
      response.end("canary");
    }, () => { canaryUpgrades += 1; });
    app = await startServer((request, response) => {
      if (request.url === "/redirect") {
        response.writeHead(302, { location: `${canary.origin}/forbidden` });
        response.end();
        return;
      }
      response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      response.end("<!doctype html><html lang=\"ko\"><body>허용된 공개 화면</body></html>");
    });
    const specPath = path.join(root, "network.spec.ts");
    const configPath = path.join(root, "playwright.config.mjs");
    const source = `import { test, expect } from ${JSON.stringify(path.join(repository, "tests/support/expanded-public-test.ts"))};
const forbidden = ${JSON.stringify(canary.origin)};
test("ALLOWED", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("허용된 공개 화면")).toBeVisible();
});
test("EXTERNAL_HTTP", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (url) => { await fetch(url).catch(() => undefined); }, forbidden + "/forbidden");
});
test("EXTERNAL_REDIRECT", async ({ page }) => {
  await page.goto("/redirect").catch(() => undefined);
});
test("EXTERNAL_WEBSOCKET", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async (url) => {
    await new Promise<void>((resolve) => {
      const socket = new WebSocket(url.replace("http:", "ws:"));
      socket.onclose = () => resolve();
      socket.onerror = () => resolve();
    });
  }, forbidden + "/socket");
});
`;
    await writeFile(specPath, source, { flag: "wx" });
    const config = {
      testDir: root, testMatch: "network.spec.ts", forbidOnly: true, retries: 0, workers: 1, timeout: 10_000,
      outputDir: path.join(root, "results"), reporter: "json",
      use: { baseURL: app.origin, browserName: "chromium", trace: "off", screenshot: "off", video: "off", serviceWorkers: "block" },
    };
    await writeFile(configPath, `export default ${JSON.stringify(config)};\n`, { flag: "wx" });
    const report = await runBrowser(configPath, app.origin);
    // 임의 JSON 오류 객체를 단언에 넘기지 않아 실패 시 원문이 출력되지 않게 한다.
    const statuses = new Map();
    const visit = (suite) => {
      for (const spec of suite.specs ?? []) {
        const results = spec.tests?.[0]?.results;
        if (["ALLOWED", "EXTERNAL_HTTP", "EXTERNAL_REDIRECT", "EXTERNAL_WEBSOCKET"].includes(spec.title)) {
          statuses.set(spec.title, results?.map((result) => result.status).join(",") ?? "missing");
        }
      }
      for (const nested of suite.suites ?? []) visit(nested);
    };
    visit(report);
    assert.equal(statuses.size, 4, "NETWORK_CASE_COUNT");
    assert.equal(statuses.get("ALLOWED"), "passed", "NETWORK_ALLOWED_STATUS");
    for (const name of ["EXTERNAL_HTTP", "EXTERNAL_REDIRECT", "EXTERNAL_WEBSOCKET"]) {
      assert.equal(statuses.get(name), "failed", "NETWORK_BLOCKED_STATUS");
    }
    assert.equal(canaryRequests, 0, "NETWORK_CANARY_REQUESTS");
    assert.equal(canaryUpgrades, 0, "NETWORK_CANARY_UPGRADES");
  } finally {
    if (app) await app.close();
    if (canary) await canary.close();
    if (root) await rm(root, { recursive: true, force: true });
  }
});
