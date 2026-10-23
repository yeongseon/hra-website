// @vitest-environment node
/**
 * API v1 공지 서비스의 실제 PostgreSQL 검색·정렬·페이지 계약을 검증합니다.
 * 합성 원문만 사용하며 Neon 요청은 소유 임시 DB의 Unix 소켓으로 제한합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({
  database: undefined as NeonHttpDatabase<typeof schema> | undefined,
}));

vi.mock("@/lib/db", () => ({
  get db() {
    if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
    return mocks.database;
  },
}));

import { listPublishedNoticesForApi } from "@/features/notices/public-list/service";

const bin = process.env.HRA_TEST_PG_BIN;
const ids = {
  pinnedOld: "70000000-0000-4000-8000-000000000001",
  pinnedNew: "70000000-0000-4000-8000-000000000002",
  ordinary: "70000000-0000-4000-8000-000000000003",
  draft: "70000000-0000-4000-8000-000000000004",
  other: "70000000-0000-4000-8000-000000000005",
};

describe.skipIf(!bin)("API v1 공지 목록 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    // 원본 Drizzle 공지 표의 조회 대상 컬럼·enum·기본값을 그대로 재현한 최소 합성 표입니다.
    cluster.sql(`
      CREATE TYPE notice_status AS ENUM ('DRAFT', 'PUBLISHED');
      CREATE TABLE notices (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL, content text NOT NULL,
        status notice_status NOT NULL DEFAULT 'DRAFT', pinned boolean NOT NULL DEFAULT false,
        author_id uuid, view_count integer NOT NULL DEFAULT 0,
        created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now()
      );
      INSERT INTO notices(id,title,content,status,pinned,author_id,view_count,created_at,updated_at) VALUES
        ('${ids.pinnedOld}', 'Event 모집 가', '**합성 본문 가**', 'PUBLISHED', true,
          '80000000-0000-4000-8000-000000000001', 4, '2026-10-01 00:00:00', '2026-10-04 00:00:00'),
        ('${ids.pinnedNew}', 'event 모집 나', '**합성 본문 나**', 'PUBLISHED', true,
          '80000000-0000-4000-8000-000000000002', 5, '2026-10-01 00:00:00', '2026-10-05 00:00:00'),
        ('${ids.ordinary}', 'EVENT 모집 다', '합성 본문 다', 'PUBLISHED', false,
          '80000000-0000-4000-8000-000000000003', 6, '2026-10-03 00:00:00', '2026-10-06 00:00:00'),
        ('${ids.draft}', 'Event 모집 비공개', '비공개 본문', 'DRAFT', true,
          '80000000-0000-4000-8000-000000000004', 7, '2026-10-07 00:00:00', '2026-10-07 00:00:00'),
        ('${ids.other}', '다른 소식', '합성 기타', 'PUBLISHED', false,
          '80000000-0000-4000-8000-000000000005', 8, '2026-10-08 00:00:00', '2026-10-08 00:00:00');
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      postCount++;
      try {
        return Response.json(await transport(JSON.parse(String(options.body))));
      } catch {
        return Response.json({ message: "격리 SQL 실행 거부", code: "QA_TRANSPORT_ERROR" }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    const ownedRoot = cluster?.root;
    cluster?.close();
    if (ownedRoot) expect(existsSync(ownedRoot)).toBe(false);
  });

  it("초안을 제외하고 대소문자 무시 검색·고정/작성일/ID 순서와 발췌문을 지킨다", async () => {
    postCount = 0;
    const result = await listPublishedNoticesForApi({ query: "  eVeNt  ", page: 1, pageSize: 2 });

    expect(result.totalCount).toBe(3);
    expect(result.items.map((item) => item.id)).toEqual([ids.pinnedNew, ids.pinnedOld]);
    expect(result.items[0].excerpt).toBe("합성 본문 나");
    expect(result.items[0].updatedAt.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(Object.keys(result.items[0])).toEqual([
      "id", "title", "excerpt", "pinned", "viewCount", "createdAt", "updatedAt",
    ]);
    expect(postCount).toBe(2); // count + 한 번의 목록 SELECT, 개별 본문 재조회 없음
  });

  it("다음 페이지와 범위 밖 페이지는 요청 번호를 보존할 수 있는 목록 결과를 돌려준다", async () => {
    postCount = 0;
    const second = await listPublishedNoticesForApi({ query: "event", page: 2, pageSize: 2 });
    expect(second.totalCount).toBe(3);
    expect(second.items.map((item) => item.id)).toEqual([ids.ordinary]);
    expect(postCount).toBe(2);

    postCount = 0;
    const beyond = await listPublishedNoticesForApi({ query: "EVENT", page: 99, pageSize: 2 });
    expect(beyond).toEqual({ items: [], totalCount: 3 });
    expect(postCount).toBe(1); // 범위 밖이면 본문 목록 쿼리를 실행하지 않음
  });

  it("SQL처럼 보이는 검색어를 값으로 바인딩하고 초안·다른 제목을 모두 제외한다", async () => {
    postCount = 0;
    const result = await listPublishedNoticesForApi({ query: "' OR true; --", page: 1, pageSize: 10 });
    expect(result).toEqual({ items: [], totalCount: 0 });
    expect(postCount).toBe(1);
  });
});
