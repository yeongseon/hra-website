// @vitest-environment node
/** 운영 DB 설치 도구가 연결 URL을 분리하고 비밀번호를 출력하지 않는지 검증합니다 (#121). */
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("요청 제한 마이그레이션 실행 도구", () => {
  it("psql에 DB 이름과 접속 정보를 분리해 전달하며 비밀번호를 출력하지 않는다", () => {
    const root = mkdtempSync(join(tmpdir(), "hra-rate-limit-cli-"));
    const fakePsql = join(root, "psql");
    const password = "test-secret-value";
    try {
      writeFileSync(fakePsql, `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  db: process.env.PGDATABASE,
  host: process.env.PGHOST,
  sslmode: process.env.PGSSLMODE,
  passwordPassed: process.env.PGPASSWORD === "${password}",
}));
`);
      chmodSync(fakePsql, 0o700);
      const output = execFileSync(process.execPath, [
        "scripts/migrate-rate-limit-reservations.mjs", "--confirm-apply",
      ], {
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: `postgresql://hra:${password}@db.example.com/hra_test?sslmode=require`,
          HRA_PSQL_BIN: fakePsql,
        },
      });
      expect(output).toContain('"db":"hra_test"');
      expect(output).toContain('"host":"db.example.com"');
      expect(output).toContain('"passwordPassed":true');
      expect(output).not.toContain(password);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
