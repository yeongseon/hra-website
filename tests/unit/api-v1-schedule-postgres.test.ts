// @vitest-environment node
/**
 * 공개 일정 서비스의 실제 PostgreSQL 월별 조회와 API/Web 직렬화 계약을 검증합니다.
 * 합성 일정만 사용하고 Neon 요청은 소유 임시 DB의 Unix 소켓으로 제한합니다.
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

import { listPublicScheduleApiMonth, listPublicScheduleMonth, serializePublicScheduleEvents } from "@/features/schedule/public/service";

const bin = process.env.HRA_TEST_PG_BIN;
const ids = {
  cohort: "70000000-0000-4000-8000-000000000001",
  faculty: "70000000-0000-4000-8000-000000000002",
  september: "70000000-0000-4000-8000-000000000010",
  octoberFirst: "70000000-0000-4000-8000-000000000011",
  octoberMiddle: "70000000-0000-4000-8000-000000000012",
  octoberLast: "70000000-0000-4000-8000-000000000013",
  private: "70000000-0000-4000-8000-000000000014",
  november: "70000000-0000-4000-8000-000000000015",
};

describe.skipIf(!bin)("API v1 공개 일정 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    // 조회 대상 표의 관계·타입·비공개 열을 실제 Drizzle 스키마에 맞춘 최소 합성 자료입니다.
    cluster.sql(`
      CREATE TYPE schedule_event_type AS ENUM ('CLASS', 'EVENT');
      CREATE TYPE session_category AS ENUM ('CLASSICS', 'ENGLISH', 'SPEECH', 'SPECIAL_LECTURE', 'CASE_STUDY');
      CREATE TABLE cohorts (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL,
        google_form_url text, google_sheet_id text
      );
      CREATE TABLE faculty (
        id uuid PRIMARY KEY, name varchar(100) NOT NULL,
        current_position text, former_position text
      );
      CREATE TABLE schedule_events (
        id uuid PRIMARY KEY, event_date timestamp NOT NULL, end_time varchar(5),
        event_type schedule_event_type NOT NULL, title varchar(200) NOT NULL,
        cohort_id uuid REFERENCES cohorts(id), week_number integer,
        description text, is_public boolean NOT NULL DEFAULT true
      );
      CREATE TABLE schedule_sessions (
        id uuid PRIMARY KEY, schedule_event_id uuid NOT NULL REFERENCES schedule_events(id),
        category session_category NOT NULL, faculty_id uuid REFERENCES faculty(id),
        content text, report_category varchar(50), sub_title text,
        sub_description text, "order" integer NOT NULL DEFAULT 0
      );
      INSERT INTO cohorts VALUES
        ('${ids.cohort}', '합성 10기', 'https://private.invalid/form', '비공개 시트 식별자');
      INSERT INTO faculty VALUES
        ('${ids.faculty}', '합성 교수', '비공개 현직', '비공개 전직');
      INSERT INTO schedule_events(id,event_date,end_time,event_type,title,cohort_id,week_number,description,is_public) VALUES
        ('${ids.private}', '2026-10-10 09:00:00', NULL, 'CLASS', '비공개 일정', '${ids.cohort}', 2, NULL, false),
        ('${ids.octoberLast}', '2026-10-31 23:30:00', '23:55', 'EVENT', '월말 행사', NULL, NULL, '월말', true),
        ('${ids.september}', '2026-09-30 23:59:59', NULL, 'EVENT', '9월 경계', NULL, NULL, NULL, true),
        ('${ids.octoberMiddle}', '2026-10-15 14:20:00', '16:00', 'CLASS', '합성 수업', '${ids.cohort}', 3, '수업 안내', true),
        ('${ids.november}', '2026-11-01 00:00:00', NULL, 'EVENT', '11월 경계', NULL, NULL, NULL, true),
        ('${ids.octoberFirst}', '2026-10-01 00:00:00', NULL, 'EVENT', '월초 행사', NULL, NULL, NULL, true);
      INSERT INTO schedule_sessions(id,schedule_event_id,category,faculty_id,content,report_category,sub_title,sub_description,"order") VALUES
        ('80000000-0000-4000-8000-000000000003', '${ids.octoberMiddle}', 'CASE_STUDY', NULL, '세 번째', 'business-practice', '부제', '부연', 3),
        ('80000000-0000-4000-8000-000000000001', '${ids.octoberMiddle}', 'CLASSICS', '${ids.faculty}', '첫 번째', NULL, NULL, NULL, 1),
        ('80000000-0000-4000-8000-000000000002', '${ids.octoberMiddle}', 'ENGLISH', NULL, '두 번째', NULL, NULL, NULL, 2);
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
  }, 60_000);

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    const ownedRoot = cluster?.root;
    cluster?.close();
    if (ownedRoot) expect(existsSync(ownedRoot)).toBe(false);
  });

  it("공개 월 경계·날짜순·세션 순서·벽시계 시각을 지키며 표시 필드만 반환한다", async () => {
    postCount = 0;
    const result = await listPublicScheduleApiMonth(2026, 10);

    expect(result.year).toBe(2026);
    expect(result.month).toBe(10);
    expect(result.timeZone).toBe("Asia/Seoul");
    expect(result.events.map((event) => event.id)).toEqual([
      ids.octoberFirst, ids.octoberMiddle, ids.octoberLast,
    ]);
    expect(result.events.map((event) => `${event.calendarDate} ${event.startTime}`)).toEqual([
      "2026-10-01 00:00", "2026-10-15 14:20", "2026-10-31 23:30",
    ]);
    expect(result.events[2].endTime).toBe("23:55");
    expect(result.events[1].cohort).toEqual({ id: ids.cohort, name: "합성 10기" });
    expect(result.events[1].sessions.map((session) => session.order)).toEqual([1, 2, 3]);
    expect(result.events[1].sessions.map((session) => session.content)).toEqual(["첫 번째", "두 번째", "세 번째"]);
    expect(result.events[1].sessions[0].faculty).toEqual({ id: ids.faculty, name: "합성 교수" });
    expect(result.events[1].sessions[2]).toEqual({
      category: "CASE_STUDY", content: "세 번째", reportCategory: "business-practice",
      subTitle: "부제", subDescription: "부연", faculty: null, order: 3,
    });
    expect(Object.keys(result.events[1].cohort ?? {})).toEqual(["id", "name"]);
    expect(Object.keys(result.events[1].sessions[0].faculty ?? {})).toEqual(["id", "name"]);
    expect(JSON.stringify(result)).not.toMatch(/googleSheetId|googleFormUrl|currentPosition|formerPosition|email|비공개 시트 식별자/);
    expect(postCount).toBe(1); // 중첩 기수·세션·교수도 일정당 추가 SQL 없이 조회합니다.
  });

  it("Web 직렬화의 기존 ISO 시각을 같은 PostgreSQL 조회 결과에서 유지한다", async () => {
    const events = await listPublicScheduleMonth(2026, 10);
    const web = serializePublicScheduleEvents(events);
    expect(web.map((event) => event.eventDate)).toEqual([
      "2026-10-01T00:00:00.000Z", "2026-10-15T14:20:00.000Z", "2026-10-31T23:30:00.000Z",
    ]);
    expect(web[1].cohort).toEqual({ id: ids.cohort, name: "합성 10기" });
    expect(web[1].sessions.map((session) => session.order)).toEqual([1, 2, 3]);
  });

  it("잘못된 연·월은 SQL 전송 전에 거부한다", async () => {
    postCount = 0;
    for (const [year, month] of [[1899, 10], [2026, 0], [2026, 13], [2026, 1.5]]) {
      await expect(listPublicScheduleApiMonth(year, month)).rejects.toThrow("SCHEDULE_MONTH_INVALID");
    }
    expect(postCount).toBe(0);
  });
});
