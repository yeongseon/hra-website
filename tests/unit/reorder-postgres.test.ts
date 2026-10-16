// @vitest-environment node
/** 실제 헬퍼 SQL과 PostgreSQL의 갱신 건수·전체 반영·동시 요청 계약을 검증한다. */
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { eq, type SQL } from "drizzle-orm";
import { integer, pgTable, PgDialect, uuid } from "drizzle-orm/pg-core";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport } from "../support/neon-psql-transport.mjs";

const { executeMock } = vi.hoisted(() => ({
  executeMock: vi.fn<(query: SQL) => Promise<{ rowCount: number }>>(),
}));
vi.mock("@/lib/db", () => ({ db: { execute: executeMock } }));
import { reorderByCase } from "@/lib/db/reorder";

const bin = process.env.HRA_TEST_PG_BIN;
// 대소문자 표현이 달라도 PostgreSQL에서는 같은 UUID인 경우를 포함한다.
const firstId = "a1111111-1111-4111-8111-111111111111";
const secondId = "b2222222-2222-4222-8222-222222222222";
const missingId = "c3333333-3333-4333-8333-333333333333";
const items = pgTable("reorder_test_items", {
  id: uuid("id").primaryKey(),
  order: integer("order").notNull(),
  scope: integer("scope").notNull(),
});
type Running = {
  child: ChildProcessWithoutNullStreams;
  done: Promise<{ code: number | null; output: string }>;
};

describe.skipIf(!bin)("순서 변경 PostgreSQL 회귀", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let transport: ReturnType<typeof createPsqlTransport>;
  const active = new Set<Running>();
  const queuedNames: string[] = [];
  const baseline = "10\n20";
  const orders = () => cluster.sql('SELECT "order" FROM reorder_test_items ORDER BY id;');
  const reorder = (assignments: { id: string; value: number }[], scoped = false) =>
    reorderByCase({
      table: items,
      idColumn: items.id,
      targetColumn: items.order,
      assignments,
      extraWhere: scoped ? eq(items.scope, 1) : undefined,
    });

  /** 자식 프로세스는 이 테스트가 생성한 격리 DB 환경만 받는다. 원문 오류를 밖으로 복사하지 않는다. */
  function start(program: string, args: string[]): Running {
    const child = spawn(program, args, {
      env: { ...cluster.environment, NODE_ENV: "test" },
      stdio: ["pipe", "pipe", "pipe"],
      // 전송용 Node가 먼저 종료돼도 같은 그룹의 psql 자손까지 정리할 수 있게 분리한다.
      detached: true,
    });
    let output = "";
    child.stdout.on("data", chunk => {
      output += String(chunk);
    });
    child.stderr.resume();
    const done = new Promise<{ code: number | null; output: string }>(resolve => {
      child.once("error", () => resolve({ code: -1, output: "" }));
      child.once("close", code => resolve({ code, output }));
    });
    const running = { child, done };
    active.add(running);
    return running;
  }

  /** 존재하지 않는 자체 프로세스 그룹만 정상 종료로 간주하며 다른 신호 오류는 숨기지 않는다. */
  function signalGroup(running: Running, signal: NodeJS.Signals | 0): boolean {
    const pid = running.child.pid;
    if (pid === undefined) return false;
    try {
      process.kill(-pid, signal);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
      if (error instanceof Error && "code" in error && error.code === "EPERM") {
        // macOS에서 고아 자손이 종료되는 경계의 EPERM은 숫자 PGID 목록으로 소멸을 재확인한다.
        const listed = spawnSync("/bin/ps", ["-axo", "pgid=,stat="], {
          encoding: "utf8",
          timeout: 1_000,
        });
        if (listed.status !== 0 || listed.error) throw new Error("격리 프로세스 그룹 확인 실패");
        const members = listed.stdout.split("\n")
          .map(line => line.trim().split(/\s+/))
          .filter(([group]) => Number(group) === pid);
        if (members.length === 0) return false;
        // 이미 종료된 자손은 신호를 받을 수 없지만 재수거가 끝날 때까지 그룹 소멸을 기다린다.
        if (signal === 0 || members.every(([, state]) => state.startsWith("Z"))) return true;
      }
      throw error;
    }
  }

  /** 정상·실패 경로 모두 유한 시간 안에 그룹과 격리 DB 세션을 정리하고 소멸을 확인한다. */
  async function cleanup() {
    const running = [...active];
    for (const process of running) signalGroup(process, "SIGTERM");
    // psql이 죽어도 서버가 쿼리를 계속 실행할 수 있으므로 자체 DB의 나머지 연결도 종료한다.
    cluster.sql(`
      SELECT pg_terminate_backend(pid) FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid();
    `);
    const termDeadline = Date.now() + 500;
    while (Date.now() < termDeadline && running.some(process => signalGroup(process, 0))) {
      await delay(20);
    }
    for (const process of running) signalGroup(process, "SIGKILL");
    const killDeadline = Date.now() + 3_000;
    while (running.some(process => signalGroup(process, 0))) {
      if (Date.now() >= killDeadline) throw new Error("격리 순서 변경 프로세스 그룹 정리 실패");
      await delay(20);
    }
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("격리 자식 프로세스 종료 확인 실패")), 3_000);
      Promise.all(running.map(process => process.done)).then(() => {
        clearTimeout(timeout);
        resolve();
      }, error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
    active.clear();
    await waitFor(`
      SELECT (count(*)=0)::integer FROM pg_stat_activity
      WHERE datname=current_database() AND pid<>pg_backend_pid();
    `);
  }

  /** 동기 psql 전송은 자식 Node에서 실행해야 부모가 잠금 대기를 관찰하고 다른 연결을 해제할 수 있다. */
  async function executeConcurrent(payload: { query: string; params: (string | number | boolean | null)[] }) {
    const moduleUrl = new URL("../support/neon-psql-transport.mjs", import.meta.url).href;
    const running = start(process.execPath, ["--input-type=module", "--eval", `
      import { createPsqlTransport } from ${JSON.stringify(moduleUrl)};
      let input = "";
      for await (const chunk of process.stdin) input += chunk;
      try {
        const result = await createPsqlTransport(process.env)(JSON.parse(input));
        process.stdout.write(JSON.stringify({ rowCount: result.rowCount }));
      } catch {
        process.exitCode = 1;
      }
    `]);
    running.child.stdin.end(JSON.stringify(payload));
    const result = await running.done;
    if (result.code !== 0) throw new Error("격리 순서 변경 SQL 실행 실패");
    const parsed: unknown = JSON.parse(result.output);
    if (!parsed || typeof parsed !== "object" || !("rowCount" in parsed)
      || typeof parsed.rowCount !== "number") {
      throw new Error("격리 순서 변경 건수 응답 오류");
    }
    return { rowCount: parsed.rowCount };
  }

  /** 고정 지연으로 경합을 추정하지 않고 서버가 보고하는 연결 상태를 상한 내에서 관찰한다. */
  async function waitFor(query: string) {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (cluster.sql(query) === "1") return;
      await delay(20);
    }
    throw new Error("순서 변경의 실제 PostgreSQL 잠금 상태를 확인하지 못했습니다.");
  }

  function blocker(statement: string) {
    const running = start(join(bin!, "psql"), ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"]);
    running.child.stdin.write(`SET application_name='reorder_blocker'; BEGIN; ${statement}\n`);
    return running;
  }

  const waitForBlocker = () => waitFor(`
    SELECT count(*) FROM pg_stat_activity
    WHERE application_name='reorder_blocker' AND state='idle in transaction';
  `);
  const waitForReorder = (name: string) => waitFor(`
    SELECT count(*) FROM pg_stat_activity
    WHERE pid<>pg_backend_pid() AND datname=current_database()
      AND query LIKE '%/* ${name} */%' AND wait_event_type='Lock';
  `);

  async function commit(running: Running) {
    running.child.stdin.end("COMMIT;\n");
    expect((await running.done).code).toBe(0);
  }

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    transport = createPsqlTransport(cluster.environment);
    cluster.sql(`
      CREATE TABLE reorder_test_items (
        id uuid PRIMARY KEY,
        "order" integer NOT NULL CHECK ("order">=0),
        scope integer NOT NULL
      );
    `);
  }, 30_000);

  beforeEach(() => {
    queuedNames.length = 0;
    executeMock.mockReset();
    executeMock.mockImplementation(async statement => {
      const rendered = new PgDialect().sqlToQuery(statement);
      const params = rendered.params.map(value => {
        if (value === null || typeof value === "string"
          || typeof value === "number" || typeof value === "boolean") {
          return value;
        }
        throw new Error("순서 변경 테스트에 예상하지 못한 바인딩 값이 있습니다.");
      });
      const name = queuedNames.shift();
      const payload = { query: name ? `${rendered.sql} /* ${name} */` : rendered.sql, params };
      // 반환 건수는 PostgreSQL의 실제 ROW_COUNT이며 헬퍼 계약을 모킹하지 않는다.
      return name ? executeConcurrent(payload) : transport(payload);
    });
    cluster.sql(`
      TRUNCATE reorder_test_items;
      INSERT INTO reorder_test_items VALUES
        ('${firstId}',10,1),('${secondId}',20,1);
    `);
  });

  // 신호·그룹·자식·세션의 각 유한 대기와 psql 자체 상한보다 훅 예산을 길게 둔다.
  afterEach(cleanup, 45_000);
  afterAll(() => {
    cluster?.close();
  });

  it("전체 두 행의 정수 순서와 실제 affected=2를 반환한다", async () => {
    expect(await reorder([
      { id: firstId, value: 2 },
      { id: secondId, value: 1 },
    ])).toEqual({ affected: 2 });
    expect(executeMock).toHaveBeenCalledOnce();
    expect(orders()).toBe("2\n1");
  });

  it("빈 요청은 DB를 호출하지 않는다", async () => {
    expect(await reorder([])).toEqual({ affected: 0 });
    expect(executeMock).not.toHaveBeenCalled();
    expect(orders()).toBe(baseline);
  });

  it("없는 ID가 섞이면 affected=0이며 기존 행도 바꾸지 않는다", async () => {
    expect.soft(await reorder([
      { id: firstId, value: 2 },
      { id: missingId, value: 1 },
    ])).toEqual({ affected: 0 });
    expect(orders()).toBe(baseline);
  });

  it.each([firstId, firstId.toUpperCase()])("같은 UUID 중복 표현 %s는 전체 요청을 거부한다", async duplicate => {
    expect.soft(await reorder([
      { id: firstId, value: 2 },
      { id: duplicate, value: 1 },
    ])).toEqual({ affected: 0 });
    expect(orders()).toBe(baseline);
  });

  it("추가 범위 조건 밖의 ID가 섞이면 전체 요청을 반영하지 않는다", async () => {
    cluster.sql(`UPDATE reorder_test_items SET scope=2 WHERE id='${secondId}';`);
    expect.soft(await reorder([
      { id: firstId, value: 2 },
      { id: secondId, value: 1 },
    ], true)).toEqual({ affected: 0 });
    expect(orders()).toBe(baseline);
  });

  it.each(["delete", "scope"])("다른 연결의 %s 커밋을 기다린 뒤 일부 행만 갱신하지 않는다", async change => {
    const held = blocker(change === "delete"
      ? `DELETE FROM reorder_test_items WHERE id='${firstId}';`
      : `UPDATE reorder_test_items SET scope=2 WHERE id='${firstId}';`);
    await waitForBlocker();
    queuedNames.push("reorder_changed_waiter");
    const result = reorder([
      { id: firstId, value: 2 },
      { id: secondId, value: 1 },
    ], true);
    // 대기 도중 자식 실패도 즉시 수집해 정리 전에 미처리 rejection이 남지 않게 한다.
    const observed = result.then(value => ({ value }), () => ({ value: null }));
    await waitForReorder("reorder_changed_waiter");
    await commit(held);
    const completed = await observed;
    expect.soft(completed.value).toEqual({ affected: 0 });
    expect(orders()).toBe(change === "delete" ? "20" : baseline);
  }, 15_000);

  it("역순의 두 동시 요청은 한 요청의 전체 결과만 남긴다", async () => {
    const held = blocker(`SELECT id FROM reorder_test_items WHERE id='${firstId}' FOR UPDATE;`);
    await waitForBlocker();
    queuedNames.push("reorder_first", "reorder_reverse");
    const first = reorder([
      { id: firstId, value: 101 },
      { id: secondId, value: 102 },
    ]);
    const reverse = reorder([
      { id: secondId, value: 202 },
      { id: firstId, value: 201 },
    ]);
    const observed = Promise.allSettled([first, reverse]);
    await waitForReorder("reorder_first");
    await waitForReorder("reorder_reverse");
    await commit(held);
    const completed = await observed;
    expect(completed).toEqual([
      { status: "fulfilled", value: { affected: 2 } },
      { status: "fulfilled", value: { affected: 2 } },
    ]);
    expect(["101\n102", "201\n202"]).toContain(orders());
  }, 15_000);

  it("갱신 제약 실패는 전체 문장을 롤백한다", async () => {
    await expect(reorder([
      { id: firstId, value: 2 },
      { id: secondId, value: -1 },
    ])).rejects.toMatchObject({ code: "23514" });
    expect(orders()).toBe(baseline);
  });

  it("전송 Node가 실패해도 psql 자손·세션·잠금을 다음 테스트 전에 정리한다", async () => {
    const running = start(process.execPath, ["--input-type=module", "--eval", `
      import { spawnSync } from "node:child_process";
      spawnSync(${JSON.stringify(join(bin!, "psql"))}, ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"], {
        env: process.env,
        input: ${JSON.stringify(`
          SET application_name='reorder_cleanup_failure';
          BEGIN;
          SELECT id FROM reorder_test_items WHERE id='${firstId}' FOR UPDATE;
          SELECT pg_sleep(30);
        `)},
        stdio: ["pipe", "ignore", "ignore"],
      });
    `]);
    await waitFor(`
      SELECT count(*) FROM pg_stat_activity
      WHERE application_name='reorder_cleanup_failure' AND wait_event='PgSleep';
    `);
    // 실제 부모 프로세스 실패를 유도한다. 이 시점에는 psql 자손이 행 잠금을 보유한다.
    running.child.kill("SIGKILL");
    await cleanup();
    expect(signalGroup(running, 0)).toBe(false);
    expect(cluster.sql(`
      SELECT count(*) FROM pg_stat_activity
      WHERE application_name='reorder_cleanup_failure';
    `)).toBe("0");
    // afterEach 종료 시점에 다음 beforeEach의 TRUNCATE가 즉시 실행 가능한지도 확인한다.
    cluster.sql("SET lock_timeout='200ms'; TRUNCATE reorder_test_items;");
  }, 15_000);
});
