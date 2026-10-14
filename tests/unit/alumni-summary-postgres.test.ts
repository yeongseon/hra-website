// @vitest-environment node
/** 수료생 이야기 요약 SQL이 실제 PostgreSQL에서 본문 대신 평문만 반환하는지 검증합니다 (#127). */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alumniStorySummary } from "@/features/alumni/summary";

const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("수료생 이야기 평문 요약 SQL", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (query: string) => execFileSync(program("psql"), psqlArgs, {
    input: query,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-alumni-summary-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55449`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55449", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run("CREATE TABLE alumni_stories (content text NOT NULL);");
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("Markdown 링크 URL과 HTML 태그를 제거하고 180자로 제한한다", () => {
    run("INSERT INTO alumni_stories (content) VALUES ('# 성장 **이야기** <p>함께</p> [HRA](https://example.com)');");
    const rendered = new PgDialect().sqlToQuery(sql`SELECT ${alumniStorySummary} AS summary FROM alumni_stories`);
    const params = rendered.params.map((value) => {
      if (typeof value !== "string") throw new Error("예상하지 못한 요약 SQL 인자입니다.");
      return `'${value.replaceAll("'", "''")}'`;
    });
    const summary = run(`PREPARE alumni_summary AS ${rendered.sql}; EXECUTE alumni_summary(${params.join(", ")});`);
    expect(summary).toBe("성장 이야기 함께 HRA");
    run("TRUNCATE alumni_stories; INSERT INTO alumni_stories (content) VALUES (repeat('가', 250));");
    const longSummary = run(`PREPARE alumni_summary AS ${rendered.sql}; EXECUTE alumni_summary(${params.join(", ")});`);
    expect(longSummary).toHaveLength(180);
  });
});
