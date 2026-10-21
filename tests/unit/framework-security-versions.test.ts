// @vitest-environment node
/**
 * #266·#267·#269 공개 공지의 수정 버전 하한을 기본 CI에서 검사합니다.
 * 중첩 설치된 취약 인스턴스도 검사하며, 새로운 보안 공지 확인은 Dependabot과 병행합니다.
 * 근거: GHSA-p3m5-59mp-jv5r, GHSA-2464-fhr4-w9xw, GHSA-x445-f3h2-j279.
 * 붙여넣기 검증 하한: https://github.com/ProseMirror/prosemirror-view/security/advisories/GHSA-c8x8-7fp4-3x9w
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const lock: { packages: Record<string, { version?: string }> } = JSON.parse(
  readFileSync(new URL("../../package-lock.json", import.meta.url), "utf8"),
);

describe.each([
  { name: "next", minimum: [16, 4, 1] },
  { name: "sharp", minimum: [0, 35, 5] },
  { name: "@auth/core", minimum: [0, 41, 3] },
  { name: "prosemirror-view", minimum: [1, 42, 3] },
])("$name 보안 수정 버전", ({ name, minimum }) => {
  it("루트와 중첩된 모든 설치가 검증한 안정 버전 하한을 만족한다", () => {
    const entries = Object.entries(lock.packages).filter(([path]) => path.endsWith(`/node_modules/${name}`) || path === `node_modules/${name}`);
    expect(entries.length).toBeGreaterThan(0);
    for (const [path, entry] of entries) {
      if (name === "prosemirror-view") {
        // 잠금 파일만 고치고 실제 설치를 갱신하지 않은 경우도 기본 CI에서 드러냅니다.
        // 루트뿐 아니라 나중에 추가되는 중첩 인스턴스도 같은 경로의 설치 결과와 대조합니다.
        const installed: { version?: string } = JSON.parse(readFileSync(new URL(`../../${path}/package.json`, import.meta.url), "utf8"));
        expect(installed.version, `${path} 실제 설치`).toBe(entry.version);
      }
      expect(entry.version, path).toMatch(/^\d+\.\d+\.\d+$/);
      const parts = (entry.version ?? "").split(".").map(Number);
      // 첫 번째로 다른 자리만 비교해 16.10.x 같은 이후 안정 버전도 허용합니다.
      const index = parts.findIndex((part, position) => part !== minimum[position]);
      expect(index === -1 || parts[index] > minimum[index], `${path}@${entry.version}`).toBe(true);
    }
  });
});

it("next-auth의 모든 설치가 beta.32 이후 또는 v5 이후 안정 버전이다", () => {
  const entries = Object.entries(lock.packages).filter(([path]) => path.endsWith("/node_modules/next-auth") || path === "node_modules/next-auth");
  expect(entries.length).toBeGreaterThan(0);
  for (const [path, entry] of entries) {
    const version = entry.version ?? "";
    const beta = /^5\.0\.0-beta\.(\d+)$/.exec(version);
    // 채널이 다른 시험판을 안정 버전으로 취급하지 않고, 현재 v5 수정 하한을 유지합니다.
    const patched = beta ? Number(beta[1]) >= 32 : /^\d+\.\d+\.\d+$/.test(version) && Number(version.split(".")[0]) >= 5;
    expect(patched, `${path}@${version}`).toBe(true);
  }
});
