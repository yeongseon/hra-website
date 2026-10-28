// @vitest-environment node
/**
 * 회원 가이드북 상세의 역할·UUID 경계와 최소 조회를 격리 PostgreSQL에서 검증합니다.
 * 합성 자료만 만들고 Neon 전송은 소유 임시 클러스터로 한정합니다.
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
    if (!mocks.database) throw new Error("격리 DB 준비 전 호출 차단");
    return mocks.database;
  },
}));

import { getGuidebookForReader } from "@/features/guidebooks/member-detail/service";

const bin = process.env.HRA_TEST_PG_BIN;
const bookId = "73000000-0000-4000-8000-000000000001";
const missingId = "73000000-0000-4000-8000-000000000099";

describe.skipIf(!bin)("가이드북 상세 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const queries: string[] = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE guidebooks (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL,
        file_url text NOT NULL, file_name varchar(500) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      );
      INSERT INTO guidebooks(id,title,file_url,file_name)
      VALUES ('${bookId}','합성 가이드북','private://must-not-read','안내.PDF');
    `);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body)) as { query: string };
      queries.push(request.query);
      // 원본 URL·내부 시각은 응답뿐 아니라 SQL 투영에서도 제외해야 합니다.
      if (/\b(?:file_url|created_at)\b/i.test(request.query)) throw new Error("비공개 열 조회 차단");
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

  it.each(["MEMBER", "FACULTY", "ADMIN"])("승인된 %s는 뷰어 표시 세 필드만 받는다", async (readerRole) => {
    queries.length = 0;
    expect(await getGuidebookForReader({ id: bookId, readerRole })).toEqual({
      id: bookId, title: "합성 가이드북", fileName: "안내.PDF",
    });
    expect(queries).toHaveLength(1);
    expect(queries[0]).toMatch(/^select "id", "title", "file_name" from "guidebooks"/i);
    expect(queries[0]).toContain('where "guidebooks"."id" = $1 limit $2');
  });

  it("익명·대기·알 수 없는 역할과 잘못된 UUID는 DB 전에 거부한다", async () => {
    queries.length = 0;
    for (const readerRole of [null, undefined, "PENDING", "UNKNOWN"]) {
      expect(await getGuidebookForReader({ id: bookId, readerRole })).toBeNull();
    }
    for (const id of ["invalid", "", "73000000-0000-4000-0000-000000000001"]) {
      expect(await getGuidebookForReader({ id, readerRole: "MEMBER" })).toBeNull();
    }
    expect(queries).toHaveLength(0);
  });

  it("없는 자료는 null이고 저장소 실패는 없는 자료로 위장하지 않는다", async () => {
    expect(await getGuidebookForReader({ id: missingId, readerRole: "MEMBER" })).toBeNull();
    const currentFetch = neonConfig.fetchFunction;
    neonConfig.fetchFunction = async () => { throw new Error("합성 DB 전송 실패"); };
    try {
      await expect(getGuidebookForReader({ id: bookId, readerRole: "MEMBER" })).rejects.toThrow();
    } finally {
      neonConfig.fetchFunction = currentFetch;
    }
  });
});
