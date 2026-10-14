// @vitest-environment node
/**
 * 운영 데이터를 쓸 수 있는 일회성 스크립트가 확인 인자 없이 중단되는지 검증합니다 (#120).
 * 가짜 DB 주소만 사용하며 네트워크 연결이나 데이터 변경은 하지 않습니다.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const baseUrl = "postgresql://user:password@ep-example.us-east-2.aws.neon.tech/hra";
const poolerUrl = "postgresql://user:password@ep-example-pooler.us-east-2.aws.neon.tech/hra";

function runScript(script: string, args: string[], extraEnv: Record<string, string> = {}) {
  return spawnSync(process.execPath, [join(process.cwd(), "scripts", script), ...args], {
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: baseUrl,
      ADMIN_PASSWORD: "test-only-password",
      HRA_TEST_DATABASE_URL: "",
      ...extraEnv,
    },
  });
}

describe("일회성 DB 스크립트 실행 조건", () => {
  it("관리자 시드는 확인 인자가 없으면 DB 조회 전에 중단한다", () => {
    const result = runScript("seed-admin.mjs", []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--confirm-create");
  });

  it("OAuth 검증은 별도 테스트 DB와 확인 인자를 모두 요구한다", () => {
    const result = runScript("verify-oauth-binding-security.mjs", []);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("HRA_TEST_DATABASE_URL");
  });

  it("OAuth 검증은 같은 운영 브랜치의 pooler 주소를 거부한다", () => {
    const result = runScript("verify-oauth-binding-security.mjs", ["--confirm-test-db"], {
      HRA_TEST_DATABASE_URL: poolerUrl,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("같은 DB");
  });

  it("잘못된 테스트 DB 주소를 출력하지 않고 중단한다", () => {
    const result = runScript("verify-oauth-binding-security.mjs", ["--confirm-test-db"], {
      HRA_TEST_DATABASE_URL: "invalid-secret-url",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("연결 문자열의 형식");
    expect(result.stderr).not.toContain("invalid-secret-url");
  });
});
