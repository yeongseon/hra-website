// @vitest-environment node
/**
 * 공개 모집안내 Repository의 최소 SQL 필드와 조건부 기수 조회를 격리 PostgreSQL에서 검증합니다.
 * 설정의 비공개·미사용 열이나 기수별 별도 모집 URL은 공개 DTO로 읽지 않습니다.
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
    if (!mocks.database) throw new Error("격리 DB 준비 전 조회 차단");
    return mocks.database;
  },
}));

import { getPublicRecruitmentOverview } from "@/features/recruitment/public-overview/service";

const bin = process.env.HRA_TEST_PG_BIN;
const cohortId = "82000000-0000-4000-8000-000000000001";
const orphanId = "82000000-0000-4000-8000-000000000099";

describe.skipIf(!bin)("공개 모집안내 실제 PostgreSQL 투영", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let queryCount = 0;
  const settingsQueries: string[] = [];
  const cohortQueries: string[] = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE cohorts (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL, description text,
        recruitment_status text, google_form_url text, google_sheet_id text
      );
      CREATE TABLE recruitment_settings (
        id uuid PRIMARY KEY, active_cohort_id uuid, recruitment_start_date timestamp,
        deadline_date timestamp, google_form_url text, poster_image_url text,
        poster_layout text, details_markdown text, recruitment_status text,
        next_recruitment_year integer, qualification_text text
      );
      INSERT INTO cohorts (id,name,description,recruitment_status,google_form_url,google_sheet_id)
      VALUES ('${cohortId}','합성 20기','공개 기수 소개','CLOSED','private://cohort-form','private-sheet');
      INSERT INTO recruitment_settings (
        id,active_cohort_id,recruitment_start_date,deadline_date,google_form_url,
        poster_image_url,poster_layout,details_markdown,recruitment_status,
        next_recruitment_year,qualification_text
      ) VALUES (
        '82000000-0000-4000-8000-000000000010','${cohortId}',
        '2026-10-16','2026-10-30','https://forms.example.invalid/apply',
        'https://images.example.invalid/poster.jpg','left','# 공개 안내',
        'CLOSED',2099,'내부 지원 자격'
      );
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body));
      if (/\b(?:recruitment_status|next_recruitment_year|qualification_text|google_sheet_id)\b/i.test(JSON.stringify(request))) {
        throw new Error("비표시 모집 열 조회 차단");
      }
      if (/from "recruitment_settings"/i.test(request.query)) settingsQueries.push(request.query);
      if (/from "cohorts"/i.test(request.query)) cohortQueries.push(request.query);
      queryCount++;
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

  it("설정과 활성 기수의 표시 열만 읽고 날짜 기반 상태를 반환한다", async () => {
    queryCount = 0;
    settingsQueries.length = 0;
    cohortQueries.length = 0;
    const overview = await getPublicRecruitmentOverview(new Date("2026-10-20T00:00:00Z"));
    expect(queryCount).toBe(2);
    expect(settingsQueries).toHaveLength(1);
    expect(cohortQueries).toHaveLength(1);
    const settingsProjection = /^select ([\s\S]*?) from "recruitment_settings"/i.exec(settingsQueries[0])?.[1];
    const cohortProjection = /^select ([\s\S]*?) from "cohorts"/i.exec(cohortQueries[0])?.[1];
    expect(settingsProjection?.split(", ")).toHaveLength(7);
    expect(cohortProjection?.split(", ")).toHaveLength(3);
    for (const column of [
      "active_cohort_id", "recruitment_start_date", "deadline_date", "google_form_url",
      "poster_image_url", "poster_layout", "details_markdown",
    ]) expect(settingsProjection).toContain(`"${column}"`);
    expect(overview).toMatchObject({
      activeCohort: { name: "합성 20기", description: "공개 기수 소개" },
      recruitmentStatus: "OPEN",
      googleFormUrl: "https://forms.example.invalid/apply",
      posterLayout: "left",
      detailsMarkdown: "# 공개 안내",
    });
    expect(Object.keys(overview)).toEqual([
      "activeCohort", "recruitmentStatus", "recruitmentStartDate", "deadlineDate",
      "googleFormUrl", "posterImageUrl", "posterLayout", "detailsMarkdown",
    ]);
    expect(JSON.stringify(overview)).not.toMatch(/내부 지원 자격|private:|qualificationText|nextRecruitmentYear|activeCohortId|googleSheetId/);
  });

  it("활성 기수 지정이 없으면 기수 SQL을 실행하지 않는다", async () => {
    cluster?.sql("UPDATE recruitment_settings SET active_cohort_id = NULL;");
    queryCount = 0;
    const overview = await getPublicRecruitmentOverview(new Date("2026-10-20T00:00:00Z"));
    expect(queryCount).toBe(1);
    expect(overview.activeCohort).toBeNull();
    expect(overview.recruitmentStatus).toBe("OPEN");
  });

  it("설정이 가리키는 기수가 없거나 설정 자체가 없을 때 빈 상태를 유지한다", async () => {
    cluster?.sql(`UPDATE recruitment_settings SET active_cohort_id = '${orphanId}';`);
    queryCount = 0;
    expect((await getPublicRecruitmentOverview(new Date("2026-10-20T00:00:00Z"))).activeCohort).toBeNull();
    expect(queryCount).toBe(2);
    cluster?.sql("TRUNCATE recruitment_settings;");
    queryCount = 0;
    const empty = await getPublicRecruitmentOverview(new Date("2026-10-20T00:00:00Z"));
    expect(empty.activeCohort).toBeNull();
    expect(empty.recruitmentStatus).toBe("UPCOMING");
    expect(empty.googleFormUrl).toBeNull();
    expect(queryCount).toBe(1);
  });
});
