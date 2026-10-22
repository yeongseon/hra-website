/**
 * Vitest 설정 파일
 *
 * 역할:
 * - TypeScript 경로 별칭(@/*)을 테스트 환경에서도 그대로 사용합니다.
 * - React 컴포넌트 테스트가 가능하도록 Vite React 플러그인을 연결합니다.
 * - 기본 테스트 범위를 `tests/unit` 하위로 제한해 단위 테스트와 E2E 테스트를 분리합니다.
 */

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Next 빌드가 검사하는 서버 전용 표식은 테스트에서 설치된 빈 서버 구현으로 해석합니다.
  // 앱의 클라이언트 경계 검증은 실제 Next production 빌드에서 그대로 수행합니다.
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) },
  },
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
