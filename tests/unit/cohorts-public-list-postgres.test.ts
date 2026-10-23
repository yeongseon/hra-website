// @vitest-environment node
/**
 * 공개 기수의 시작일 조건과 숫자 이름 정렬을 소유 PostgreSQL에서 확인합니다.
 * 합성 행만 사용하고 운영 링크 열은 조회 SQL에도 포함하지 않습니다.
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

import { listVisibleCohorts } from "@/features/cohorts/public-list/service";

const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("공개 기수 목록 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE cohorts (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL, description text,
        start_date timestamp, end_date timestamp, is_active boolean NOT NULL,
        image_url text, "order" integer NOT NULL, google_form_url text,
        google_sheet_id text
      );
      INSERT INTO cohorts(id,name,description,start_date,end_date,is_active,image_url,"order",google_form_url,google_sheet_id) VALUES
        ('82000000-0000-4000-8000-000000000001','1기',NULL,NULL,NULL,false,NULL,1,'https://private.invalid/form','private-sheet'),
        ('82000000-0000-4000-8000-000000000020','20기','합성 현재 기수','2026-01-01',NULL,true,NULL,20,NULL,NULL),
        ('82000000-0000-4000-8000-000000000099','특별반',NULL,NULL,NULL,false,NULL,99,NULL,NULL),
        ('82000000-0000-4000-8000-000000000002','2기','합성 미래 기수','2026-12-01',NULL,false,NULL,2,NULL,NULL);
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body));
      if (/google_form_url|google_sheet_id/i.test(JSON.stringify(request))) {
        throw new Error("운영 링크 열 조회 금지");
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

  it("미래 시작 기수는 숨기고 시작일 없는 기수는 숫자 순서 뒤에 표시한다", async () => {
    const rows = await listVisibleCohorts(new Date("2026-10-24T00:00:00Z"));
    expect(rows.map((row) => row.name)).toEqual(["20기", "1기", "특별반"]);
    expect(rows[0]).toMatchObject({ description: "합성 현재 기수", isActive: true });
    expect(Object.keys(rows[0])).toEqual([
      "name", "startDate", "endDate", "description", "isActive", "imageUrl",
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/googleFormUrl|googleSheetId|private-sheet|private\.invalid/);
  });

  it("기준 시각과 정확히 같은 시작일도 공개한다", async () => {
    const rows = await listVisibleCohorts(new Date("2026-12-01T00:00:00Z"));
    expect(rows.map((row) => row.name)).toEqual(["20기", "2기", "1기", "특별반"]);
  });
});
