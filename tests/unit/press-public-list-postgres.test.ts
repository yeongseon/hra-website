// @vitest-environment node
/**
 * 공개 언론보도 게시판의 건수·순서·페이지를 소유 PostgreSQL에서 검증합니다.
 * 합성 기사만 사용하고 설명·이미지 등 비표시 열은 SQL 조회부터 차단합니다.
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

import { listPublicPressArticles } from "@/features/press/public-list/service";

const bin = process.env.HRA_TEST_PG_BIN;
const fillerValues = Array.from({ length: 14 }, (_, index) => {
  const number = index + 3;
  const id = `83000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  return `('${id}','보조 기사 ${number}','합성 매체','https://article.invalid/${number}',` +
    `'2026-10-01',1,0,'내부 설명','private://image')`;
}).join(",");

describe.skipIf(!bin)("공개 언론보도 목록 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE press_articles (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL, source varchar(200) NOT NULL,
        url text NOT NULL, published_at timestamp NOT NULL, "order" integer NOT NULL,
        view_count integer NOT NULL, description text, image_url text
      );
      INSERT INTO press_articles(id,title,source,url,published_at,"order",view_count,description,image_url) VALUES
        ('83000000-0000-4000-8000-000000000001','가 기사','합성 매체','https://article.invalid/a',
          '2026-10-10',0,1,'내부 설명','private://image'),
        ('83000000-0000-4000-8000-000000000002','나 기사','합성 매체','https://article.invalid/b',
          '2026-10-10',0,2,'내부 설명','private://image'),
        ${fillerValues};
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body));
      if (/\b(?:description|image_url|created_at|updated_at)\b/i.test(JSON.stringify(request))) {
        throw new Error("비표시 열 조회 금지");
      }
      postCount++;
      try {
        return Response.json(await transport(request));
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

  it("관리자 순서와 같은 게시일의 ID 순서로 15행만 공개한다", async () => {
    postCount = 0;
    const page = await listPublicPressArticles("1");
    expect(page).toMatchObject({ totalCount: 16, currentPage: 1, totalPages: 2, startIndex: 0 });
    expect(page.currentArticles).toHaveLength(15);
    expect(page.currentArticles.slice(0, 2).map((row) => row.title)).toEqual(["나 기사", "가 기사"]);
    expect(postCount).toBe(2);
    expect(Object.keys(page.currentArticles[0])).toEqual([
      "id", "title", "source", "url", "publishedAt", "viewCount",
    ]);
    expect(JSON.stringify(page)).not.toMatch(/내부 설명|private:|description|imageUrl/);
  });

  it("범위 밖 페이지는 마지막 기사 한 건과 번호 계산용 시작 인덱스로 보정한다", async () => {
    const page = await listPublicPressArticles("999");
    expect(page).toMatchObject({ totalCount: 16, currentPage: 2, totalPages: 2, startIndex: 15 });
    expect(page.currentArticles.map((row) => row.title)).toEqual(["보조 기사 3"]);
  });
});
