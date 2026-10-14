// @vitest-environment node
/**
 * #108 순서 변경 SQL을 격리 PostgreSQL에서 실행합니다.
 * 실제 헬퍼가 생성한 바인딩 SQL을 PREPARE/EXECUTE하여 정수 컬럼 대입을 검증합니다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SQL } from "drizzle-orm";
import { integer, pgTable, PgDialect, uuid } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn<(query: SQL) => Promise<{ rowCount: number }>>().mockResolvedValue({ rowCount: 2 }),
}));

vi.mock("@/lib/db", () => ({ db: { execute: executeMock } }));

import { reorderByCase } from "@/lib/db/reorder";

const bin = process.env.HRA_TEST_PG_BIN;
const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const items = pgTable("reorder_test_items", {
  id: uuid("id").primaryKey(),
  order: integer("order").notNull(),
});

describe.skipIf(!bin)("순서 변경 PostgreSQL 회귀", () => {
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
    root = mkdtempSync(join(tmpdir(), "hra-reorder-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55444`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55444", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
    run(`CREATE TABLE reorder_test_items (id uuid PRIMARY KEY, "order" integer NOT NULL);
      INSERT INTO reorder_test_items (id, "order") VALUES ('${firstId}', 1), ('${secondId}', 2);`);
  }, 30000);

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("정수 순서를 바인딩한 CASE UPDATE가 실제 DB에서 두 행을 갱신한다", async () => {
    executeMock.mockClear();
    const result = await reorderByCase({
      table: items,
      idColumn: items.id,
      targetColumn: items.order,
      assignments: [{ id: firstId, value: 2 }, { id: secondId, value: 1 }],
    });
    expect(result.affected).toBe(2);
    expect(executeMock).toHaveBeenCalledOnce();

    const statement = executeMock.mock.calls[0][0];
    const rendered = new PgDialect().sqlToQuery(statement);
    // PREPARE는 타입이 없는 바인딩 파라미터를 PostgreSQL이 직접 해석하게 합니다.
    const values = rendered.params.map((value) => {
      if (typeof value === "number") return String(value);
      if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
      throw new Error("순서 변경 테스트에 예상하지 못한 파라미터가 있습니다.");
    });
    const orders = run(`PREPARE reorder_test AS ${rendered.sql};
      EXECUTE reorder_test(${values.join(", ")});
      SELECT "order" FROM reorder_test_items ORDER BY id;`);
    expect(orders).toBe("2\n1");
  });
});
