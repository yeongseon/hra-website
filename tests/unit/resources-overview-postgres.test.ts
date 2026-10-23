// @vitest-environment node
/**
 * 자료실 통합 목록의 현재 역할·SQL 대상 필터·정렬·원본 파일 비노출을 소유 PostgreSQL에서 검증합니다.
 * 합성 행과 임시 Unix 소켓만 사용하며 운영 DB·Blob에는 접근하지 않습니다.
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

import { getResourcesOverview } from "@/features/resources/overview/service";

const bin = process.env.HRA_TEST_PG_BIN;
const ids = {
  member: "75000000-0000-4000-8000-000000000001",
  faculty: "75000000-0000-4000-8000-000000000002",
  admin: "75000000-0000-4000-8000-000000000003",
  pending: "75000000-0000-4000-8000-000000000004",
  revoked: "75000000-0000-4000-8000-000000000005",
  cohort20: "76000000-0000-4000-8000-000000000020",
  cohort1: "76000000-0000-4000-8000-000000000001",
};

describe.skipIf(!bin)("자료실 통합 목록 실제 PostgreSQL 경계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE user_role AS ENUM ('ADMIN','FACULTY','MEMBER','PENDING');
      CREATE TYPE report_template_category AS ENUM ('template','guide');
      CREATE TABLE cohorts(id uuid PRIMARY KEY,name varchar(100) NOT NULL);
      CREATE TABLE users(id uuid PRIMARY KEY,name varchar(100) NOT NULL,email varchar(255) NOT NULL,
        role user_role NOT NULL,cohort_id uuid,image text);
      CREATE TABLE class_logs(id uuid PRIMARY KEY,title varchar(300) NOT NULL,
        class_date timestamp NOT NULL,created_at timestamp NOT NULL,author_id uuid,cohort_id uuid);
      CREATE TABLE weekly_texts(id uuid PRIMARY KEY,title varchar(300) NOT NULL,file_url text NOT NULL,
        body text,class_date timestamp,created_at timestamp NOT NULL,cohort_id uuid,text_type varchar(20));
      CREATE TABLE class_materials(id uuid PRIMARY KEY,title varchar(300) NOT NULL,file_url text NOT NULL,
        class_date timestamp,created_at timestamp NOT NULL,audience varchar(20) NOT NULL,
        week_number integer,lecture_title varchar(200),uploaded_by_id uuid);
      CREATE TABLE guidebooks(id uuid PRIMARY KEY,title varchar(300) NOT NULL,
        file_url text NOT NULL,file_name varchar(500) NOT NULL,created_at timestamp NOT NULL);
      CREATE TABLE report_templates(id uuid PRIMARY KEY,slug varchar(200) NOT NULL,title varchar(300) NOT NULL,
        category report_template_category NOT NULL,published boolean NOT NULL,"order" integer NOT NULL,
        body text NOT NULL,created_at timestamp NOT NULL);
      INSERT INTO cohorts(id,name) VALUES
        ('${ids.cohort1}','1기'),('${ids.cohort20}','20기'),('76000000-0000-4000-8000-000000000099','특별반');
      INSERT INTO users(id,name,email,role,cohort_id) VALUES
        ('${ids.member}','합성 회원','member@fixture.invalid','MEMBER','${ids.cohort20}'),
        ('${ids.faculty}','합성 교수','faculty@fixture.invalid','FACULTY',NULL),
        ('${ids.admin}','합성 관리자','admin@fixture.invalid','ADMIN',NULL),
        ('${ids.pending}','합성 대기','pending@fixture.invalid','PENDING',NULL),
        ('${ids.revoked}','합성 변경','revoked@fixture.invalid','MEMBER','${ids.cohort1}');
      INSERT INTO class_logs(id,title,class_date,created_at,author_id,cohort_id) VALUES
        ('77000000-0000-4000-8000-000000000001','옛 일지','2026-10-01','2026-10-01','${ids.admin}','${ids.cohort1}'),
        ('77000000-0000-4000-8000-000000000002','새 일지','2026-10-02','2026-10-02','${ids.faculty}','${ids.cohort20}');
      INSERT INTO weekly_texts(id,title,file_url,body,class_date,created_at,cohort_id,text_type) VALUES
        ('78000000-0000-4000-8000-000000000001','본문 글','', '합성 비공개 본문','2026-10-02','2026-10-02','${ids.cohort20}','고전명작'),
        ('78000000-0000-4000-8000-000000000002','파일 글','private://text-secret',NULL,NULL,'2026-10-01','${ids.cohort1}',NULL);
      INSERT INTO class_materials(id,title,file_url,class_date,created_at,audience,week_number,lecture_title,uploaded_by_id) VALUES
        ('79000000-0000-4000-8000-000000000001','학생 강의','private://student','2026-10-02','2026-10-02','STUDENT',1,'합성 주제','${ids.faculty}'),
        ('79000000-0000-4000-8000-000000000002','교수 강의','private://faculty',NULL,'2026-10-01','FACULTY',2,NULL,'${ids.faculty}');
      INSERT INTO guidebooks(id,title,file_url,file_name,created_at) VALUES
        ('7a000000-0000-4000-8000-000000000001','합성 가이드북','private://guide-secret','secret.pdf','2026-10-02');
      INSERT INTO report_templates(id,slug,title,category,published,"order",body,created_at) VALUES
        ('7b000000-0000-4000-8000-000000000001','guide','안내','guide',true,2,'내부 본문','2026-10-01'),
        ('7b000000-0000-4000-8000-000000000002','template','양식','template',true,1,'내부 본문','2026-10-02'),
        ('7b000000-0000-4000-8000-000000000003','hidden','비공개 양식','template',false,0,'내부 본문','2026-10-03');
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

  it("MEMBER는 현재 기수와 학생 대상 자료·본문/파일 분기만 받는다", async () => {
    const result = await getResourcesOverview({ userId: ids.member, role: "MEMBER" });
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") throw new Error("합성 회원 권한 오류");
    expect(result.userCohortId).toBe(ids.cohort20);
    expect(result.cohorts.map((row) => row.name)).toEqual(["20기", "1기", "특별반"]);
    expect(result.logs.map((row) => row.title)).toEqual(["새 일지", "옛 일지"]);
    expect(result.weeklyTexts.map((row) => [row.title, row.hasBody, row.hasFile])).toEqual([
      ["본문 글", true, false], ["파일 글", false, true],
    ]);
    expect(result.classMaterials.map((row) => row.title)).toEqual(["학생 강의"]);
    expect(result.guidebooks.map((row) => row.title)).toEqual(["합성 가이드북"]);
    expect(result.templates.map((row) => row.title)).toEqual(["양식", "안내"]);
    expect(JSON.stringify(result)).not.toMatch(/private:|secret\.pdf|합성 비공개 본문|내부 본문/);
  });

  it("FACULTY·ADMIN은 강의자료 두 audience를 SQL에서 읽는다", async () => {
    for (const [userId, role] of [[ids.faculty, "FACULTY"], [ids.admin, "ADMIN"]] as const) {
      const result = await getResourcesOverview({ userId, role });
      expect(result.kind).toBe("ok");
      if (result.kind !== "ok") throw new Error("합성 운영 역할 오류");
      expect(result.classMaterials.map((row) => row.title)).toEqual(["학생 강의", "교수 강의"]);
    }
  });

  it("PENDING은 모든 DB 접근 전에 거부하고 역할 철회·계정 삭제는 목록 전에 무효화한다", async () => {
    postCount = 0;
    expect(await getResourcesOverview({ userId: ids.pending, role: "PENDING" })).toEqual({ kind: "forbidden" });
    expect(postCount).toBe(0);

    cluster?.sql(`UPDATE users SET role='PENDING' WHERE id='${ids.revoked}';`);
    postCount = 0;
    expect(await getResourcesOverview({ userId: ids.revoked, role: "MEMBER" })).toEqual({ kind: "unauthenticated" });
    expect(postCount).toBe(1); // 현재 사용자 한 건만 조회하고 콘텐츠 여섯 조회는 실행하지 않음

    cluster?.sql(`DELETE FROM users WHERE id='${ids.revoked}';`);
    expect(await getResourcesOverview({ userId: ids.revoked, role: "MEMBER" })).toEqual({ kind: "unauthenticated" });
  });
});
