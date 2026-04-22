/**
 * Playwright 설정 파일
 *
 * 역할:
 * - E2E 테스트를 `tests/e2e` 하위에서 실행합니다.
 * - 로컬에서 별도 base URL을 주지 않으면 Next 개발 서버를 자동으로 띄우도록 설정합니다.
 * - 우선 Chromium 1개 프로젝트부터 시작해 기본 스모크 테스트를 빠르게 돌릴 수 있게 합니다.
 */

import { defineConfig, devices } from "@playwright/test";

const port = 3100;
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
  ],
});
