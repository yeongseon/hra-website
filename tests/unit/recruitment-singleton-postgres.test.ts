// @vitest-environment node
/**
 * #99 모집설정 고정 키와 최초 동시 저장의 실제 PostgreSQL 회귀 테스트.
 * 운영 DB 대신 임시 로컬 클러스터를 사용한다.
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("모집설정 단일 행", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-recruitment-singleton-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55442`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55442", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE recruitment_settings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      active_cohort_id text, poster_layout text, details_markdown text,
      updated_at timestamp NOT NULL DEFAULT now());
      ALTER TABLE recruitment_settings ADD COLUMN singleton_key integer NOT NULL DEFAULT 1;
      ALTER TABLE recruitment_settings ADD CONSTRAINT recruitment_settings_singleton_key_unique
        UNIQUE (singleton_key);
      ALTER TABLE recruitment_settings ADD CONSTRAINT recruitment_settings_singleton_key_check
        CHECK (singleton_key = 1);`);
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("고정 키 1 외의 행과 두 번째 설정 행을 거부한다", () => {
    run("TRUNCATE recruitment_settings;");
    run("INSERT INTO recruitment_settings (singleton_key) VALUES (1);");
    expect(() => run("INSERT INTO recruitment_settings (singleton_key) VALUES (2);")).toThrow();
    expect(() => run("INSERT INTO recruitment_settings (singleton_key) VALUES (1);")).toThrow();
    expect(run("SELECT count(*) FROM recruitment_settings;")).toBe("1");
  });

  it("빈 테이블에서 서로 다른 섹션의 동시 최초 저장이 한 행에 합쳐진다", async () => {
    run("TRUNCATE recruitment_settings;");
    const first = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    const firstDone = new Promise<number | null>((resolve, reject) => {
      first.on("error", reject);
      first.on("close", resolve);
    });
    first.stdin.write(`SET application_name = 'hra_first_settings'; BEGIN;
      INSERT INTO recruitment_settings (singleton_key, active_cohort_id)
      VALUES (1, '2026') ON CONFLICT (singleton_key) DO UPDATE
      SET active_cohort_id = EXCLUDED.active_cohort_id;\n`);
    try {
      let ready = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_first_settings' AND state = 'idle in transaction';") === "1") {
          ready = true;
          break;
        }
        await delay(20);
      }
      expect(ready).toBe(true);
      const second = spawn(program("psql"), psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
      let secondError = "";
      second.stderr.on("data", chunk => { secondError += String(chunk); });
      const secondDone = new Promise<number | null>((resolve, reject) => {
        second.on("error", reject);
        second.on("close", resolve);
      });
      second.stdin.end(`SET application_name = 'hra_second_settings';
        INSERT INTO recruitment_settings (singleton_key, details_markdown)
        VALUES (1, '모집 안내') ON CONFLICT (singleton_key) DO UPDATE
        SET details_markdown = EXCLUDED.details_markdown;`);
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        if (run("SELECT count(*) FROM pg_stat_activity WHERE application_name = 'hra_second_settings' AND wait_event_type = 'Lock';") === "1") {
          waiting = true;
          break;
        }
        await delay(20);
      }
      expect(waiting, secondError).toBe(true);
      first.stdin.end("COMMIT;\n");
      expect(await firstDone).toBe(0);
      expect(await secondDone, secondError).toBe(0);
      expect(run("SELECT count(*) FROM recruitment_settings;")).toBe("1");
      expect(run("SELECT active_cohort_id || ':' || details_markdown FROM recruitment_settings;")).toBe("2026:모집 안내");
    } finally {
      if (!first.stdin.writableEnded) first.stdin.end("ROLLBACK;\n");
      if (first.exitCode === null) {
        first.kill();
        await firstDone;
      }
    }
  }, 15000);
});
