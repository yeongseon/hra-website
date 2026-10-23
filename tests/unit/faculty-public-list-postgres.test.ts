// @vitest-environment node
/**
 * 공개 교수진 목록의 순서·필드 투영을 소유 PostgreSQL에서 확인합니다.
 * 합성 행만 사용하며 Neon 전송은 임시 Unix 소켓의 psql로 제한합니다.
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

import { listPublicFaculty } from "@/features/faculty/public-list/service";

const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("공개 교수진 목록 실제 PostgreSQL 정렬", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE faculty_category AS ENUM ('CLASSICS','BUSINESS','LECTURE');
      CREATE TABLE faculty (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL,
        category faculty_category NOT NULL, current_position text,
        former_position text, image_url text, "order" integer NOT NULL,
        created_at timestamp NOT NULL, updated_at timestamp NOT NULL
      );
      INSERT INTO faculty(id,name,category,current_position,former_position,image_url,"order",created_at,updated_at) VALUES
        ('81000000-0000-4000-8000-000000000001','나 교수','CLASSICS','현직',NULL,NULL,2,now(),now()),
        ('81000000-0000-4000-8000-000000000002','라 교수','CLASSICS',NULL,'전직',NULL,3,now(),now()),
        ('81000000-0000-4000-8000-000000000003','가 교수','BUSINESS',NULL,NULL,'https://fixture.invalid/public.png',2,now(),now()),
        ('81000000-0000-4000-8000-000000000004','다 교수','LECTURE',NULL,NULL,NULL,1,now(),now());
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
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

  it("관리자 순서 뒤 이름을 적용하고 감사 시각을 공개 목록에서 제외한다", async () => {
    const rows = await listPublicFaculty();
    expect(rows.map((row) => row.name)).toEqual(["다 교수", "가 교수", "나 교수", "라 교수"]);
    expect(rows.map((row) => row.category)).toEqual(["LECTURE", "BUSINESS", "CLASSICS", "CLASSICS"]);
    expect(rows[0]).toMatchObject({ id: "81000000-0000-4000-8000-000000000004", order: 1 });
    expect(Object.keys(rows[0])).toEqual([
      "id", "name", "category", "currentPosition", "formerPosition", "imageUrl", "order",
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/createdAt|updatedAt/);
  });
});
