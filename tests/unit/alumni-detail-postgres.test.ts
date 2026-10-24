// @vitest-environment node
/**
 * 수료생 상세의 엄격 tuple 이웃·사이드바 평문 요약을 소유 PostgreSQL에서 검증합니다.
 * 합성 수료생만 사용하고 Neon 요청은 임시 Unix 소켓 psql로 한정합니다.
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

import { getPublicAlumniDetail } from "@/features/alumni/detail/service";

const bin = process.env.HRA_TEST_PG_BIN;
const ids = {
  early: "81000000-0000-4000-8000-000000000001",
  previous: "81000000-0000-4000-8000-000000000002",
  target: "81000000-0000-4000-8000-000000000003",
  peer: "81000000-0000-4000-8000-000000000004",
  next: "81000000-0000-4000-8000-000000000005",
  late: "81000000-0000-4000-8000-000000000006",
};

describe.skipIf(!bin)("수료생 상세 실제 PostgreSQL 조회 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE alumni_stories (
        id uuid PRIMARY KEY,name varchar(100) NOT NULL,title varchar(100),
        quote varchar(500) NOT NULL,content text NOT NULL,image_url text,
        "order" integer NOT NULL,created_at timestamp NOT NULL
      );
      INSERT INTO alumni_stories(id,name,title,quote,content,image_url,"order",created_at) VALUES
        ('${ids.early}','첫 수료생',NULL,'인용','첫 본문',NULL,1,'2026-10-01 09:00:00'),
        ('${ids.previous}','이전 수료생',NULL,'인용','이전 본문',NULL,2,'2026-10-02 09:00:00'),
        ('${ids.target}','대상 수료생','합성 직함','합성 인용','<p># 성장 이야기 함께 HRA</p>',NULL,2,'2026-10-03 09:00:00'),
        ('${ids.peer}','동시 수료생',NULL,'인용','동시 본문',NULL,2,'2026-10-03 09:00:00'),
        ('${ids.next}','다음 수료생',NULL,'인용','# ${"가".repeat(210)}',NULL,2,'2026-10-04 09:00:00'),
        ('${ids.late}','끝 수료생',NULL,'인용','끝 본문',NULL,3,'2026-10-05 09:00:00');
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

  it("같은 order·createdAt peer를 건너뛰고 가장 가까운 이전·다음 tuple을 고른다", async () => {
    const result = await getPublicAlumniDetail(ids.target);
    expect(result?.story).toMatchObject({
      id: ids.target, name: "대상 수료생", title: "합성 직함", quote: "합성 인용", order: 2,
    });
    expect(Object.keys(result?.story ?? {})).toEqual([
      "id", "name", "title", "quote", "content", "imageUrl", "order", "createdAt",
    ]);
    expect(result?.prevStory).toEqual({ id: ids.previous, name: "이전 수료생" });
    expect(result?.nextStory).toEqual({ id: ids.next, name: "다음 수료생" });
    expect(result?.sidebarStories[0].id).toBe(ids.early);
    expect(result?.sidebarStories.at(-1)?.id).toBe(ids.late);
  });

  it("사이드바는 180자 요약만 받고 원본 본문을 반환하지 않는다", async () => {
    const result = await getPublicAlumniDetail(ids.target);
    const next = result?.sidebarStories.find((row) => row.id === ids.next);
    expect(next?.summary).toHaveLength(180);
    expect(Object.keys(next ?? {})).toEqual(["id", "name", "title", "summary", "imageUrl"]);
    expect(result?.sidebarStories.find((row) => row.id === ids.target)?.summary).toBe("성장 이야기 함께 HRA");
    expect(JSON.stringify(result?.sidebarStories)).not.toContain("# 성장 이야기");
  });

  it("없는 상세와 엄격 UUID 실패는 이웃 조회를 진행하지 않는다", async () => {
    postCount = 0;
    expect(await getPublicAlumniDetail("bad-id")).toBeNull();
    expect(await getPublicAlumniDetail("11111111-1111-1111-1111-111111111111")).toBeNull();
    expect(postCount).toBe(0);

    expect(await getPublicAlumniDetail("81000000-0000-4000-8000-000000000099")).toBeNull();
    expect(postCount).toBe(1);
  });
});
