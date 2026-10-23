// @vitest-environment node
/**
 * 메인 수료생 carousel의 featured 조건·관리자 순서·공개 필드를 소유 PostgreSQL에서 확인합니다.
 * 합성 행과 임시 Unix 소켓만 사용하며 전체 본문은 조회하지 않습니다.
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

import { listFeaturedAlumni } from "@/features/alumni/featured/service";

const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("메인 featured 수료생 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE alumni_stories (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL, title varchar(100),
        quote varchar(500) NOT NULL, image_url text, content text NOT NULL,
        is_featured boolean NOT NULL, "order" integer NOT NULL, view_count integer NOT NULL
      );
      INSERT INTO alumni_stories(id,name,title,quote,image_url,content,is_featured,"order",view_count) VALUES
        ('89000000-0000-4000-8000-000000000001','가 수료생',NULL,'첫 인용',NULL,'내부 본문',true,0,1),
        ('89000000-0000-4000-8000-000000000002','숨긴 수료생',NULL,'숨김','private://image','내부 본문',false,-1,2),
        ('89000000-0000-4000-8000-000000000003','나 수료생','직함','둘째 인용',NULL,'내부 본문',true,1,3),
        ('89000000-0000-4000-8000-000000000004','다 수료생',NULL,'셋째 인용',NULL,'내부 본문',true,2,4),
        ('89000000-0000-4000-8000-000000000005','라 수료생',NULL,'넷째 인용',NULL,'내부 본문',true,3,5);
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body));
      if (/\b(?:content|view_count)\b/i.test(JSON.stringify(request))) {
        throw new Error("비표시 열 조회 금지");
      }
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

  it("featured만 관리자 순서로 읽고 본문·조회수는 제외한다", async () => {
    const rows = await listFeaturedAlumni();
    expect(rows.map((row) => row.name)).toEqual(["가 수료생", "나 수료생", "다 수료생", "라 수료생"]);
    expect(rows[1]).toMatchObject({ title: "직함", quote: "둘째 인용" });
    expect(Object.keys(rows[0])).toEqual(["id", "name", "title", "quote", "imageUrl"]);
    expect(JSON.stringify(rows)).not.toMatch(/내부 본문|private:|viewCount|isFeatured/);
  });

  it("featured가 모두 해제되면 빈 슬라이드 목록을 반환한다", async () => {
    cluster?.sql("UPDATE alumni_stories SET is_featured=false;");
    expect(await listFeaturedAlumni()).toEqual([]);
  });
});
