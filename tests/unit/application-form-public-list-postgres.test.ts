// @vitest-environment node
/**
 * 지원 양식 공개 목록의 발행 필터·작성일 정렬·세 필드 투영을 격리 PostgreSQL에서 검증합니다.
 * Neon HTTP 호출은 소유 임시 클러스터로만 전달하고 테스트 종료 시 해당 자원을 정리합니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { existsSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({ database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({
  get db() {
    if (!mocks.database) throw new Error("격리 DB 준비 전 공개 목록 조회 차단");
    return mocks.database;
  },
}));

import { listPublishedApplicationForms } from "@/features/applications/public-list/service";

const bin = process.env.HRA_TEST_PG_BIN;
const newestId = "91000000-0000-4000-8000-000000000001";
const olderId = "91000000-0000-4000-8000-000000000002";

describe.skipIf(!bin)("공개 지원 양식 목록 실제 PostgreSQL", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const requests: Array<{ query: string; params: Array<string | number | boolean | null> }> = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE application_forms (
        id uuid PRIMARY KEY, title varchar(255) NOT NULL, description text,
        cohort_id uuid, is_published boolean NOT NULL, questions_revision integer NOT NULL,
        created_at timestamp NOT NULL, updated_at timestamp NOT NULL
      );
      INSERT INTO application_forms (
        id,title,description,cohort_id,is_published,questions_revision,created_at,updated_at
      ) VALUES
        ('91000000-0000-4000-8000-000000000001','최근 공개 양식','최근 안내',NULL,true,7,'2026-10-03',now()),
        ('91000000-0000-4000-8000-000000000002','이전 공개 양식',NULL,NULL,true,8,'2026-10-01',now()),
        ('91000000-0000-4000-8000-000000000003','비공개 최신 양식','비공개 설명',NULL,false,9,'2026-10-04',now());
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body)) as { query: string; params: Array<string | number | boolean | null> };
      requests.push(request);
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

  it("발행된 행만 작성일 역순으로 반환하고 비표시 열은 읽지 않는다", async () => {
    requests.length = 0;
    const forms = await listPublishedApplicationForms();
    expect(forms).toEqual([
      { id: newestId, title: "최근 공개 양식", description: "최근 안내" },
      { id: olderId, title: "이전 공개 양식", description: null },
    ]);
    expect(requests).toHaveLength(1);
    const query = requests[0].query;
    const projected = /^select ([\s\S]*?) from "application_forms"/i.exec(query)?.[1];
    expect(projected?.split(", ")).toHaveLength(3);
    for (const column of ["id", "title", "description"]) expect(projected).toContain(`"${column}"`);
    expect(projected).not.toMatch(/cohort_id|is_published|questions_revision|created_at|updated_at/);
    expect(query).toContain('where "application_forms"."is_published" = $1');
    expect(query.split(' order by ')[1]).toBe('"application_forms"."created_at" desc');
    // Neon HTTP는 boolean 매개변수를 SQL에 바인딩하기 전 문자열로 직렬화합니다.
    expect(requests[0].params).toEqual(["true"]);
    expect(JSON.stringify(forms)).not.toMatch(/비공개 최신 양식|비공개 설명|questionsRevision|cohortId|createdAt/);
  });

  it("실제 DB 조회 실패를 빈 목록으로 대체하지 않는다", async () => {
    const currentFetch = neonConfig.fetchFunction;
    neonConfig.fetchFunction = async () => { throw new Error("합성 DB 전송 실패"); };
    try {
      await expect(listPublishedApplicationForms()).rejects.toThrow();
    } finally {
      neonConfig.fetchFunction = currentFetch;
    }
  });
});
