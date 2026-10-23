// @vitest-environment node
/**
 * 공지 상세의 공개 상태·이전/다음글·원자 조회수 갱신을 소유 PostgreSQL에서 검증합니다.
 * 합성 행만 사용하고 Neon HTTP 요청은 임시 Unix 소켓의 psql 전송으로 제한합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/db", () => ({
  get db() {
    if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
    return mocks.database;
  },
}));

import {
  getPublishedNoticeById,
  getPublishedNoticeDetail,
  incrementPublishedNoticeViewCount,
} from "@/features/notices/detail/service";

const bin = process.env.HRA_TEST_PG_BIN;
const ids = {
  previous: "71000000-0000-4000-8000-000000000001",
  target: "71000000-0000-4000-8000-000000000002",
  sameTime: "71000000-0000-4000-8000-000000000003",
  next: "71000000-0000-4000-8000-000000000004",
  draft: "71000000-0000-4000-8000-000000000005",
};

describe.skipIf(!bin)("공지 상세 실제 PostgreSQL 공개·조회수 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE notice_status AS ENUM ('DRAFT', 'PUBLISHED');
      CREATE TABLE notices (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL, content text NOT NULL,
        status notice_status NOT NULL DEFAULT 'DRAFT', author_id uuid,
        view_count integer NOT NULL DEFAULT 0, created_at timestamp NOT NULL,
        updated_at timestamp NOT NULL DEFAULT now()
      );
      INSERT INTO notices(id,title,content,status,author_id,view_count,created_at) VALUES
        ('${ids.previous}', '이전 공지', '이전 본문', 'PUBLISHED', NULL, 1, '2026-10-01 09:00:00'),
        ('${ids.target}', '대상 공지', '**공개 본문**', 'PUBLISHED', NULL, 7, '2026-10-02 09:00:00'),
        ('${ids.sameTime}', '같은 시각 공지', '동시 본문', 'PUBLISHED', NULL, 2, '2026-10-02 09:00:00'),
        ('${ids.next}', '다음 공지', '다음 본문', 'PUBLISHED', NULL, 3, '2026-10-03 09:00:00'),
        ('${ids.draft}', '비공개 초안', '내부 본문', 'DRAFT', NULL, 4, '2026-10-04 09:00:00');
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

  it("게시된 다섯 필드와 엄격한 작성 시각 이전·다음글만 반환한다", async () => {
    const result = await getPublishedNoticeDetail(ids.target);
    expect(result?.notice).toEqual({
      id: ids.target,
      title: "대상 공지",
      content: "**공개 본문**",
      viewCount: 7,
      createdAt: new Date("2026-10-02T09:00:00.000Z"),
    });
    expect(Object.keys(result?.notice ?? {})).toEqual(["id", "title", "content", "viewCount", "createdAt"]);
    expect(result?.prevNotice).toEqual({ id: ids.previous, title: "이전 공지" });
    expect(result?.nextNotice).toEqual({ id: ids.next, title: "다음 공지" });
  });

  it("초안·잘못된 ID는 공개하지 않고 잘못된 ID는 DB에 닿지 않는다", async () => {
    expect(await getPublishedNoticeById(ids.draft)).toBeNull();
    postCount = 0;
    expect(await getPublishedNoticeDetail("bad-id")).toBeNull();
    await incrementPublishedNoticeViewCount("bad-id");
    expect(postCount).toBe(0);
  });

  it("동시 조회수 두 번은 현재 DB 값에 각각 원자적으로 더한다", async () => {
    postCount = 0;
    await Promise.all([
      incrementPublishedNoticeViewCount(ids.target),
      incrementPublishedNoticeViewCount(ids.target),
    ]);
    expect(postCount).toBe(2);
    expect((await getPublishedNoticeById(ids.target))?.viewCount).toBe(9);
  });
});
