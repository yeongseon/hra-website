// @vitest-environment node
/**
 * 수료생 목록의 고정·날짜·ID 정렬과 DB 평문 요약을 소유 PostgreSQL에서 확인합니다.
 * 합성 행만 사용하고 Neon 요청은 임시 Unix 소켓의 psql로 제한합니다.
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

import { listPublicAlumniStories } from "@/features/alumni/public-list/service";

const bin = process.env.HRA_TEST_PG_BIN;
const fillerValues = Array.from({ length: 15 }, (_, index) => {
  const number = index + 3;
  const id = `88000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
  const date = `2026-10-${String(number).padStart(2, "0")}`;
  return `('${id}','보통 ${number}','보통 인용','합성 본문',NULL,NULL,false,'${date}',0,false)`;
}).join(",");

describe.skipIf(!bin)("공개 수료생 목록 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE alumni_stories (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL, quote varchar(500) NOT NULL,
        content text NOT NULL, title varchar(100), image_url text,
        pinned boolean NOT NULL, created_at timestamp NOT NULL,
        view_count integer NOT NULL, is_featured boolean NOT NULL
      );
      INSERT INTO alumni_stories(id,name,quote,content,title,image_url,pinned,created_at,view_count,is_featured) VALUES
        ('88000000-0000-4000-8000-000000000001','고정 하나','첫 인용',repeat('가',250),NULL,NULL,true,'2026-10-01',1,true),
        ('88000000-0000-4000-8000-000000000002','고정 둘','둘째 인용','# 성장 **이야기** <p>함께</p> [HRA](https://private.invalid/target)',NULL,NULL,true,'2026-10-01',2,true),
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
      if (/\b(?:view_count|is_featured)\b/i.test(JSON.stringify(request))) {
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

  it("첫 페이지 15건은 고정·날짜·ID 순서와 본문 없는 180자 요약을 반환한다", async () => {
    postCount = 0;
    const page = await listPublicAlumniStories("1");
    expect(page).toMatchObject({ totalCount: 17, currentPage: 1, totalPages: 2, startIndex: 0 });
    expect(page.items).toHaveLength(15);
    expect(page.items.slice(0, 4).map((row) => row.name)).toEqual(["고정 둘", "고정 하나", "보통 17", "보통 16"]);
    expect(page.items[0].summary).toBe("성장 이야기 함께 HRA");
    expect(page.items[1].summary).toHaveLength(180);
    expect(postCount).toBe(2);
    expect(Object.keys(page.items[0])).toEqual(["id", "name", "quote", "summary", "title", "imageUrl"]);
    expect(JSON.stringify(page)).not.toMatch(/private\.invalid|<p>|"content"|"viewCount"|"isFeatured"/);
  });

  it("범위 밖 페이지는 마지막 두 기사와 시작 인덱스 15로 보정한다", async () => {
    const page = await listPublicAlumniStories("999");
    expect(page).toMatchObject({ totalCount: 17, currentPage: 2, totalPages: 2, startIndex: 15 });
    expect(page.items.map((row) => row.name)).toEqual(["보통 4", "보통 3"]);
  });
});
