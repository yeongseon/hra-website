// @vitest-environment node
/** URL로 확인한 대상과 실제 psql child의 환경을 일치시키고 원문·자격정보 비노출을 검증합니다. */
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";

const temporaryRoots: string[] = [];
const password = "synthetic-private-password";
const user = "synthetic_private_user";
const connection = `postgresql://${user}:${password}@db.example.invalid/hra_synthetic?sslmode=require`;
const inheritedPg = {
  PGHOST: "poison.example.invalid", PGHOSTADDR: "127.0.0.2", PGPORT: "1", PGDATABASE: "poison", PGUSER: "poison-user", PGPASSWORD: "poison-password",
  PGSERVICE: "poison", PGSERVICEFILE: "/synthetic-private-service", PGSYSCONFDIR: "/synthetic-private-system", PGOPTIONS: "-c default_transaction_read_only=on",
  PGPASSFILE: "/synthetic-private-passfile", PGSSLMODE: "disable", PGCHANNELBINDING: "disable", PGCONNECT_TIMEOUT: "0", PGGSSENCMODE: "prefer", PGAPPNAME: "poison-app",
};
/** fake psql은 원문 env를 출력하지 않고 판정 boolean·허용된 비자격 값만 소유 파일에 남깁니다. */
function fixture(exitCode = 0, credentials = { user, password }) {
  const root = mkdtempSync(join(tmpdir(), "hra-rate-limit-cli-")); temporaryRoots.push(root);
  const binary = join(root, "psql"), captured = join(root, "captured.json");
  writeFileSync(binary, `#!/usr/bin/env node
const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(captured)},JSON.stringify({
 pgKeys:Object.keys(process.env).filter(key=>key.startsWith('PG')).sort(),
 host:process.env.PGHOST,port:process.env.PGPORT,database:process.env.PGDATABASE,
 sslmode:process.env.PGSSLMODE,binding:process.env.PGCHANNELBINDING,connect:process.env.PGCONNECT_TIMEOUT,options:process.env.PGOPTIONS,gss:process.env.PGGSSENCMODE,
 userMatched:process.env.PGUSER===${JSON.stringify(credentials.user)},passwordMatched:process.env.PGPASSWORD===${JSON.stringify(credentials.password)},
 rawUrlPresent:Object.hasOwn(process.env,'DATABASE_URL'),parentSecretPresent:Object.hasOwn(process.env,'SYNTHETIC_PARENT_SECRET'),argv:process.argv.slice(2)
}));
process.stdout.write('SYNTHETIC_PRIVATE_STDOUT');process.stderr.write('SYNTHETIC_PRIVATE_STDERR');process.exit(${exitCode});
`);
  chmodSync(binary, 0o700);
  const run = (args: string[] = ["--confirm-apply"], url: string | undefined = connection, extra: Partial<NodeJS.ProcessEnv> = {}) => spawnSync(process.execPath, ["scripts/migrate-rate-limit-reservations.mjs", ...args], {
    encoding: "utf8", timeout: 10_000,
    env: { ...process.env, ...inheritedPg, SYNTHETIC_PARENT_SECRET: "SYNTHETIC_PRIVATE_PARENT", DATABASE_URL: url, HRA_PSQL_BIN: binary, ...extra },
  });
  return { root, binary, captured, run };
}
afterEach(() => { for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function noPrivateOutput(output: string) {
  for (const marker of [password, user, "SYNTHETIC_PRIVATE_STDOUT", "SYNTHETIC_PRIVATE_STDERR", "SYNTHETIC_PRIVATE_PARENT", "poison-password"]) expect(output.includes(marker)).toBe(false);
}

describe("요청 제한 마이그레이션 실행 도구", () => {
  it("부모 PG*와 raw URL을 제거하고 검증 URL 및 고정 정책만 전달한다", () => {
    const app = fixture(), result = app.run(); expect(result.status).toBe(0); noPrivateOutput(result.stdout + result.stderr);
    const record = JSON.parse(readFileSync(app.captured, "utf8"));
    expect(record.pgKeys).toEqual(["PGCHANNELBINDING", "PGCONNECT_TIMEOUT", "PGDATABASE", "PGGSSENCMODE", "PGHOST", "PGOPTIONS", "PGPASSWORD", "PGPORT", "PGSSLMODE", "PGUSER"]);
    expect(record.host).toBe("db.example.invalid"); expect(record.port).toBe("5432"); expect(record.database).toBe("hra_synthetic"); expect(record.userMatched).toBe(true); expect(record.passwordMatched).toBe(true);
    expect(record.rawUrlPresent).toBe(false); expect(record.parentSecretPresent).toBe(false); expect(record.connect).toBe("10"); expect(record.gss).toBe("disable");
    expect(record.options).toBe("-c statement_timeout=60000 -c lock_timeout=5000 -c standard_conforming_strings=on");
    expect(record.argv.slice(0, 5)).toEqual(["-X", "-w", "-v", "ON_ERROR_STOP=1", "-f"]); expect(record.argv[5].endsWith("/scripts/sql/rate-limit-reservations.sql")).toBe(true);
    expect(JSON.stringify(record.argv).includes(password)).toBe(false); expect(result.stdout).toContain("RATE_LIMIT_MIGRATION_APPLIED");
  });
  it("명시 URL port가 부모 PGPORT 대신 사용된다", () => {
    const app = fixture(), result = app.run(["--confirm-apply"], connection.replace("db.example.invalid/", "db.example.invalid:6543/"));
    expect(result.status).toBe(0); expect(JSON.parse(readFileSync(app.captured, "utf8")).port).toBe("6543"); expect(result.stdout).toContain("db.example.invalid:6543/hra_synthetic");
  });
  it("percent-encoded URL 자격을 정확히 풀어 전달하고 인코딩 전후 모두 출력하지 않는다", () => {
    const secret = `${password}:@/%`, account = `${user}@+`;
    const app = fixture(0, { user: account, password: secret }), result = app.run(["--confirm-apply"], `postgresql://${encodeURIComponent(account)}:${encodeURIComponent(secret)}@db.example.invalid/hra_synthetic`);
    expect(result.status).toBe(0); const record = JSON.parse(readFileSync(app.captured, "utf8")); expect(record.userMatched).toBe(true); expect(record.passwordMatched).toBe(true);
    for (const marker of [secret, account, encodeURIComponent(secret), encodeURIComponent(account)]) expect((result.stdout + result.stderr).includes(marker)).toBe(false);
  });
  it("URL 자체가 없으면 부모 자격과 passfile을 사용하지 않는다", () => {
    const app = fixture(), result = app.run(["--confirm-apply"], connection, { DATABASE_URL: undefined });
    expect(result.status).toBe(1); expect(existsSync(app.captured)).toBe(false); expect(result.stderr).toContain("RATE_LIMIT_MIGRATION_TARGET_INVALID");
  });
  it("무인자 확인은 오염된 PG 환경에서도 child를 실행하지 않는다", () => {
    const app = fixture(), result = app.run([]); expect(result.status).toBe(0); expect(existsSync(app.captured)).toBe(false); noPrivateOutput(result.stdout + result.stderr); expect(result.stdout).toContain("접속 없는 확인");
  });
  for (const args of [["--apply"], ["--confirm-apply", "--confirm-apply"], ["--confirm-apply", "--unknown"]]) {
    it("잘못되거나 중복된 flag는 URL 확인과 child 실행 전에 차단한다", () => {
      const app = fixture(), result = app.run(args); expect(result.status).toBe(1); expect(existsSync(app.captured)).toBe(false); expect(result.stderr).toContain("RATE_LIMIT_MIGRATION_ARGUMENTS"); noPrivateOutput(result.stdout + result.stderr);
    });
  }
  for (const url of ["", "not-a-url", "https://db.example.invalid/hra", "postgresql://db.example.invalid/hra", "postgresql://explicit@db.example.invalid/hra", "postgresql://explicit:@db.example.invalid/hra", "postgresql://:explicit@db.example.invalid/hra", "postgresql://explicit:explicit@/hra", "postgresql://explicit:explicit@db.example.invalid/", "postgresql://explicit:explicit@db.example.invalid/host%3Dother", "postgresql://explicit:explicit@db.example.invalid/hra/other", "postgresql://explicit:explicit@db.example.invalid/hra#private", "postgresql://explicit:explicit@db.example.invalid/hra?service=poison", "postgresql://explicit:explicit@db.example.invalid/hra?passfile=poison", "postgresql://explicit:explicit@db.example.invalid/hra?hostaddr=127.0.0.2", "postgresql://explicit:explicit@db.example.invalid/hra?options=poison", "postgresql://explicit:explicit@db.example.invalid/hra?sslmode=require&sslmode=disable", "postgresql://explicit:explicit@db.example.invalid/hra?channel_binding=invalid", "postgresql://explicit:explicit@db.example.invalid/hra?sslmode=invalid", "postgresql://explicit:%ZZ@db.example.invalid/hra"]) {
    it("불완전 자격·모호한 대상·미지원 옵션은 service/passfile로 보완하지 않는다", () => {
      const app = fixture(), result = app.run(["--confirm-apply"], url); expect(result.status).toBe(1); expect(existsSync(app.captured)).toBe(false); expect(result.stderr).toContain("RATE_LIMIT_MIGRATION_TARGET_INVALID"); noPrivateOutput(result.stdout + result.stderr);
    });
  }
  for (const sslmode of ["disable", "allow", "prefer", "require", "verify-ca", "verify-full"]) {
    it(`URL의 명시 SSL 정책 ${sslmode}를 보존한다`, () => {
      const app = fixture(), result = app.run(["--confirm-apply"], connection.replace("sslmode=require", `sslmode=${sslmode}&channel_binding=require`)); expect(result.status).toBe(0);
      const record = JSON.parse(readFileSync(app.captured, "utf8")); expect(record.sslmode).toBe(sslmode); expect(record.binding).toBe("require");
    });
  }
  it("URL에 없는 SSL/binding은 require/prefer 고정 기본값을 쓴다", () => {
    const app = fixture(), result = app.run(["--confirm-apply"], connection.split("?")[0]); expect(result.status).toBe(0); const record = JSON.parse(readFileSync(app.captured, "utf8")); expect(record.sslmode).toBe("require"); expect(record.binding).toBe("prefer");
  });
  it("IPv6 host의 괄호는 libpq host 값에서 제거한다", () => {
    const app = fixture(), result = app.run(["--confirm-apply"], connection.replace("db.example.invalid", "[::1]")); expect(result.status).toBe(0); expect(JSON.parse(readFileSync(app.captured, "utf8")).host).toBe("::1");
  });
  it("psql 실패의 stdout/stderr 원문을 반사하지 않는다", () => {
    const app = fixture(1), result = app.run(); expect(result.status).toBe(1); expect(result.stderr).toContain("RATE_LIMIT_MIGRATION_FAILED"); noPrivateOutput(result.stdout + result.stderr);
  });
  it("binary 실행 오류도 자격·원래 예외 없이 고정 오류로 반환한다", () => {
    const app = fixture(), result = app.run(["--confirm-apply"], connection, { HRA_PSQL_BIN: join(app.root, "missing") }); expect(result.status).toBe(1); expect(result.stderr).toContain("RATE_LIMIT_MIGRATION_FAILED"); noPrivateOutput(result.stdout + result.stderr); expect(result.stderr.includes(app.root)).toBe(false);
  });
});

// 실제 검증도 Unix socket을 가진 소유 임시 DB 두 개만 사용합니다. 외부 주소를 연결하지 않습니다.
describe.skipIf(!process.env.HRA_TEST_PG_BIN)("소유 PostgreSQL 대상 일치", () => {
  it("부모 service가 다른 소유 DB를 가리켜도 URL의 DB에만 설치하고 재실행 데이터를 보존한다", () => {
    const app = fixture();
    const primary = createQaPostgres(process.env.HRA_TEST_PG_BIN);
    try {
      const decoy = createQaPostgres(process.env.HRA_TEST_PG_BIN);
      try {
      primary.sql("CREATE TABLE application_submissions(id uuid PRIMARY KEY);"); decoy.sql("CREATE TABLE application_submissions(id uuid PRIMARY KEY);");
      const service = join(app.root, "pg_service.conf"); writeFileSync(service, `[poison]\nhost=${decoy.root}\nport=${decoy.environment.PGPORT}\ndbname=hra_resource_qa\nuser=hra_resource_qa\npassword=synthetic-only\nsslmode=disable\n`);
      // 음성 대조: service를 상속한 libpq가 PGHOST 표시와 다른 소유 DB를 선택하는지 실제로 입증합니다.
      decoy.sql("CREATE TABLE service_redirection_canary(id integer);");
      const redirected = spawnSync(join(process.env.HRA_TEST_PG_BIN ?? "", "psql"), ["-X", "-w", "-At", "-c", "SELECT to_regclass('public.service_redirection_canary') IS NOT NULL;"], {
        encoding: "utf8", timeout: 10000,
        env: { NODE_ENV: "test", LC_ALL: "C", PGHOST: primary.root, PGPORT: primary.environment.PGPORT, PGUSER: "hra_resource_qa", PGPASSWORD: "synthetic-only", PGDATABASE: "hra_resource_qa", PGSERVICE: "poison", PGSERVICEFILE: service, PGSSLMODE: "disable", PGCHANNELBINDING: "disable" },
      });
      expect(redirected.status).toBe(0); expect(redirected.stdout.trim()).toBe("t");
      const url = `postgresql://hra_resource_qa:synthetic-only@${encodeURIComponent(primary.root)}:${primary.environment.PGPORT}/hra_resource_qa?sslmode=disable&channel_binding=disable`;
      const execute = () => spawnSync(process.execPath, ["scripts/migrate-rate-limit-reservations.mjs", "--confirm-apply"], { encoding: "utf8", timeout: 10000, env: { ...process.env, PGSERVICE: "poison", PGSERVICEFILE: service, PGOPTIONS: "-c default_transaction_read_only=on", DATABASE_URL: url, HRA_PSQL_BIN: join(process.env.HRA_TEST_PG_BIN ?? "", "psql") } });
      const first = execute(); expect(first.status).toBe(0); expect(primary.sql("SELECT to_regclass('public.rate_limit_events') IS NOT NULL;")).toBe("t"); expect(decoy.sql("SELECT to_regclass('public.rate_limit_events') IS NULL;")).toBe("t");
      expect(primary.sql("SELECT allowed FROM reserve_rate_limit(ARRAY['synthetic'],ARRAY[repeat('a',64)],ARRAY[1],ARRAY[60]);")).toBe("t");
      const second = execute(); expect(second.status).toBe(0); expect(primary.sql("SELECT count(*) FROM rate_limit_events;")).toBe("1");
      } finally { decoy.close(); }
    } finally { primary.close(); }
  }, 30000);
});
