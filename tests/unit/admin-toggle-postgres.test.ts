// @vitest-environment node
/**
 * 공지 고정·게시와 수료생 고정의 실제 서버 액션을 격리 PostgreSQL에서 검증한다.
 * 두 요청을 행 잠금에 대기시켜 같은 이전 값 조회의 유실을 재현하고,
 * 각 명령의 저장 결과·재전송의 별도 반전·삭제 경합·관리자 인가를 확인한다.
 */
import { spawn } from "node:child_process";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { drizzle, type PgRemoteDatabase } from "drizzle-orm/pg-proxy";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { bindParameters, parseCsv } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), query: vi.fn(), cache: vi.fn(), redirect: vi.fn(),
  database: undefined as PgRemoteDatabase<typeof schema> | undefined,
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.cache }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));

import { togglePin, toggleStatus } from "@/features/notices/actions";
import { toggleAlumniPin } from "@/features/alumni/actions";

const bin = process.env.HRA_TEST_PG_BIN;
const target = "10000000-0000-4000-8000-000000000001";
const missing = "10000000-0000-4000-8000-000000000099";
const actor = "20000000-0000-4000-8000-000000000001";
const cases = [
  { name: "공지 고정", table: "notices", column: "pinned", action: togglePin,
    on: "t", off: "f", onMessage: "공지사항을 고정했습니다.", offMessage: "공지사항 고정을 해제했습니다.",
    missingMessage: "공지사항을 찾을 수 없습니다.", paths: ["/admin/notices", "/notices"] },
  { name: "공지 게시", table: "notices", column: "status", action: toggleStatus,
    on: "PUBLISHED", off: "DRAFT", onMessage: "공지사항을 게시했습니다.", offMessage: "공지사항을 임시저장 상태로 변경했습니다.",
    missingMessage: "공지사항을 찾을 수 없습니다.", paths: ["/admin/notices", "/notices"] },
  { name: "수료생 고정", table: "alumni_stories", column: "pinned", action: toggleAlumniPin,
    on: "t", off: "f", onMessage: "상단에 고정했습니다.", offMessage: "고정을 해제했습니다.",
    missingMessage: "수료생 이야기를 찾을 수 없습니다.", paths: ["/", "/admin/alumni", "/alumni"] },
] as const;

describe.skipIf(!bin)("관리자 반전 명령의 실제 PostgreSQL 경합", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let sequence = 0;
  const writes: string[][] = [];
  const children = new Set<ReturnType<typeof spawn>>();

  /** 각 요청은 별도 psql 연결에서 실행하며 오류 원문은 테스트 출력에 포함하지 않는다. */
  function connection() {
    const child = spawn(join(bin!, "psql"), ["-X", "-q", "--csv", "-v", "ON_ERROR_STOP=1"], {
      env: { NODE_ENV: "test", ...cluster.environment }, stdio: ["pipe", "pipe", "pipe"],
    });
    children.add(child);
    let output = "";
    child.stdout?.on("data", chunk => { output += String(chunk); });
    // stderr는 의도적인 거부가 포함할 수 있는 SQL/매개변수 대신 종료 코드로만 분류한다.
    child.stderr?.resume();
    const done = new Promise<string>((resolve, reject) => {
      child.once("error", () => reject(new Error("격리 SQL 연결 실패")));
      child.once("close", code => {
        children.delete(child);
        if (code !== 0) reject(new Error("격리 SQL 실행 실패"));
        else resolve(output);
      });
    });
    return { child, done };
  }

  /** 잠금 대기는 pg_stat_activity로 관측해 타이밍 추정이나 SQL 스냅샷에 기대지 않는다. */
  async function waitFor(query: string, expected: string) {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (cluster.sql(query) === expected) return;
      await delay(10);
    }
    throw new Error("격리 SQL의 동시 실행 대기 상태를 확인하지 못했습니다.");
  }

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    // SQL 생성과 결과 변환은 실제 Drizzle을 유지하고 전송만 격리 소켓으로 바꾼다.
    mocks.database = drizzle((query, params) => mocks.query(query, params), { schema });
    cluster.sql(`CREATE TYPE notice_status AS ENUM ('DRAFT','PUBLISHED');
      CREATE TABLE notices (id uuid PRIMARY KEY, pinned boolean NOT NULL DEFAULT false,
        status notice_status NOT NULL DEFAULT 'DRAFT', updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE alumni_stories (id uuid PRIMARY KEY, pinned boolean NOT NULL DEFAULT false,
        updated_at timestamp NOT NULL DEFAULT now());`);
  }, 30000);

  beforeEach(() => {
    vi.resetAllMocks();
    writes.length = 0;
    sequence = 0;
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    mocks.redirect.mockImplementation(() => { throw new Error("QA_AUTH_REDIRECT"); });
    mocks.query.mockImplementation(async (query: string, params: (string | number | boolean | null)[]) => {
      const request = connection();
      request.child.stdin?.end(`SET application_name='hra_toggle_request_${++sequence}';
        ${bindParameters(query, params)};`);
      const csv = parseCsv(await request.done);
      const rows = csv.slice(1).map(row => row.map(cell =>
        cell.value === "t" ? true : cell.value === "f" ? false : cell.value));
      if (/^update\b/i.test(query)) writes.push(csv.slice(1).map(row => row[0].value));
      return { rows };
    });
    cluster.sql(`TRUNCATE notices, alumni_stories;
      INSERT INTO notices(id) VALUES ('${target}'); INSERT INTO alumni_stories(id) VALUES ('${target}');`);
  });

  afterAll(() => {
    for (const child of children) child.kill();
    mocks.database = undefined;
    cluster?.close();
  });

  describe.each(cases)("$name", feature => {
    const saved = () => cluster.sql(`SELECT ${feature.column} FROM ${feature.table} WHERE id='${target}';`);

    it("두 연결의 동시 반전은 두 번 모두 반영되고 각 반환 안내가 해당 저장값과 일치한다", async () => {
      const blocker = connection();
      blocker.child.stdin?.write(`SET application_name='hra_toggle_blocker'; BEGIN;
        SELECT id FROM ${feature.table} WHERE id='${target}' FOR UPDATE;\n`);
      const pending: Promise<unknown>[] = [];
      try {
        await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='hra_toggle_blocker' AND state='idle in transaction';", "1");
        pending.push(feature.action(target), feature.action(target));
        await waitFor("SELECT count(DISTINCT pid) FROM pg_stat_activity WHERE application_name LIKE 'hra_toggle_request_%' AND wait_event_type='Lock';", "2");
        blocker.child.stdin?.end("COMMIT;\n");
        await blocker.done;
        const results = await Promise.all(pending);
        expect.soft(saved()).toBe(feature.off);
        expect.soft(results).toEqual(expect.arrayContaining([
          { success: true, message: feature.onMessage }, { success: true, message: feature.offMessage },
        ]));
        expect.soft(writes.flat().sort()).toEqual([feature.on, feature.off].sort());
        expect(mocks.cache.mock.calls.map(([path]) => path).sort())
          .toEqual([...feature.paths, ...feature.paths].sort());
      } finally {
        if (!blocker.child.stdin?.writableEnded) blocker.child.stdin?.end("ROLLBACK;\n");
        await blocker.done;
        await Promise.allSettled(pending);
      }
    }, 10000);

    it("같은 요청의 재전송도 별도 반전 명령이며 한 번만 실행을 보장하지 않는다", async () => {
      expect(await feature.action(target)).toEqual({ success: true, message: feature.onMessage });
      expect(saved()).toBe(feature.on);
      expect(await feature.action(target)).toEqual({ success: true, message: feature.offMessage });
      expect(saved()).toBe(feature.off);
      expect(writes).toEqual([[feature.on], [feature.off]]);
    });

    it("다른 연결이 먼저 삭제를 커밋하면 성공 문구와 캐시 갱신을 반환하지 않는다", async () => {
      const deleting = connection();
      deleting.child.stdin?.write(`SET application_name='hra_toggle_blocker'; BEGIN;
        DELETE FROM ${feature.table} WHERE id='${target}';\n`);
      let pending: Promise<unknown> | undefined;
      try {
        await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name='hra_toggle_blocker' AND state='idle in transaction';", "1");
        pending = feature.action(target);
        await waitFor("SELECT count(*) FROM pg_stat_activity WHERE application_name LIKE 'hra_toggle_request_%' AND wait_event_type='Lock';", "1");
        deleting.child.stdin?.end("COMMIT;\n");
        await deleting.done;
        expect(await pending).toEqual({ success: false, message: feature.missingMessage });
        expect(saved()).toBe("");
        expect(mocks.cache).not.toHaveBeenCalled();
      } finally {
        if (!deleting.child.stdin?.writableEnded) deleting.child.stdin?.end("ROLLBACK;\n");
        await deleting.done;
        await pending;
      }
    }, 10000);

    it("처음부터 없는 대상은 실패로 안내하고 캐시를 갱신하지 않는다", async () => {
      expect(await feature.action(missing)).toEqual({ success: false, message: feature.missingMessage });
      expect(mocks.cache).not.toHaveBeenCalled();
      expect(saved()).toBe(feature.off);
    });

    it("잘못된 ID는 SQL 실행 전에 거부한다", async () => {
      expect((await feature.action("잘못된 값")).success).toBe(false);
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.cache).not.toHaveBeenCalled();
    });

    it.each([null, "MEMBER", "FACULTY", "PENDING"])("%s는 기존 관리자 인가에서 SQL 실행 전에 차단한다", async role => {
      mocks.auth.mockResolvedValue(role ? { user: { id: actor, role } } : null);
      await expect(feature.action(target)).rejects.toThrow("QA_AUTH_REDIRECT");
      expect(mocks.query).not.toHaveBeenCalled();
      expect(mocks.cache).not.toHaveBeenCalled();
    });
  });
});
