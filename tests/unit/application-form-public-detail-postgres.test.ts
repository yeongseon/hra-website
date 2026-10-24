// @vitest-environment node
/**
 * 공개 지원 양식 상세 Repository의 최소 투영·질문/선택지 순서·비공개 조기 종료를 격리 PostgreSQL로 검증합니다.
 * Neon HTTP 호출은 소유 임시 클러스터만 사용하고 종료 시 연결·파일을 정리합니다.
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
    if (!mocks.database) throw new Error("격리 DB 준비 전 공개 양식 조회 차단");
    return mocks.database;
  },
}));

import { getPublicApplicationFormDetail } from "@/features/applications/public-detail/service";

const bin = process.env.HRA_TEST_PG_BIN;
const formId = "92000000-0000-4000-8000-000000000001";
const privateFormId = "92000000-0000-4000-8000-000000000002";
const missingFormId = "92000000-0000-4000-8000-000000000099";
const firstQuestionId = "92100000-0000-4000-8000-000000000001";
const secondQuestionId = "92100000-0000-4000-8000-000000000002";

describe.skipIf(!bin)("공개 지원 양식 상세 실제 PostgreSQL", () => {
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
      CREATE TABLE application_questions (
        id uuid PRIMARY KEY, form_id uuid NOT NULL, title text NOT NULL,
        description text, type text NOT NULL, is_required boolean NOT NULL, "order" integer NOT NULL
      );
      CREATE TABLE application_question_options (
        id uuid PRIMARY KEY, question_id uuid NOT NULL, value text NOT NULL, "order" integer NOT NULL
      );
      INSERT INTO application_forms (id,title,description,cohort_id,is_published,questions_revision,created_at,updated_at)
      VALUES
        ('${formId}','공개 합성 양식','지원 안내',NULL,true,17,now(),now()),
        ('${privateFormId}','비공개 합성 양식','비공개 안내',NULL,false,33,now(),now());
      INSERT INTO application_questions (id,form_id,title,description,type,is_required,"order")
      VALUES
        ('${secondQuestionId}','${formId}','둘째 질문',NULL,'SHORT_ANSWER',false,8),
        ('${firstQuestionId}','${formId}','첫 질문','선택 안내','CHECKBOX',true,2),
        ('92100000-0000-4000-8000-000000000003','${privateFormId}','비공개 질문',NULL,'SHORT_ANSWER',false,1);
      INSERT INTO application_question_options (id,question_id,value,"order")
      VALUES
        ('92200000-0000-4000-8000-000000000002','${firstQuestionId}','나',9),
        ('92200000-0000-4000-8000-000000000001','${firstQuestionId}','가',3);
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

  it("공개 양식은 표시 필드만 질문·선택지 순서대로 반환한다", async () => {
    requests.length = 0;
    const detail = await getPublicApplicationFormDetail(formId);
    expect(detail).toEqual({
      kind: "published",
      form: { id: formId, title: "공개 합성 양식", description: "지원 안내" },
      questions: [
        { id: firstQuestionId, title: "첫 질문", description: "선택 안내", type: "CHECKBOX", isRequired: true,
          options: [{ id: "92200000-0000-4000-8000-000000000001", value: "가" }, { id: "92200000-0000-4000-8000-000000000002", value: "나" }] },
        { id: secondQuestionId, title: "둘째 질문", description: null, type: "SHORT_ANSWER", isRequired: false, options: [] },
      ],
    });
    expect(requests).toHaveLength(2);
    const formQuery = requests[0].query;
    const questionQuery = requests[1].query;
    const formProjection = /^select ([\s\S]*?) from "application_forms"/i.exec(formQuery)?.[1];
    expect(formProjection?.split(", ")).toHaveLength(4);
    for (const column of ["id", "title", "description", "is_published"]) expect(formProjection).toContain(`"${column}"`);
    expect(formProjection).not.toMatch(/cohort_id|questions_revision|created_at|updated_at/);
    expect(questionQuery).toMatch(/order by "applicationQuestions"\."order" asc$/);
    expect(questionQuery).toContain('"applicationQuestions_options"."order" asc');
    expect(JSON.stringify(detail)).not.toMatch(/cohortId|questionsRevision|formId|questionId|createdAt|updatedAt|isPublished/);
  });

  it("없는·비공개 양식과 잘못된 ID는 질문을 조회하지 않는다", async () => {
    for (const id of [missingFormId, privateFormId]) {
      requests.length = 0;
      expect(await getPublicApplicationFormDetail(id)).toEqual({ kind: "unavailable" });
      expect(requests).toHaveLength(1);
    }
    requests.length = 0;
    expect(await getPublicApplicationFormDetail("invalid")).toEqual({ kind: "invalid" });
    expect(requests).toHaveLength(0);
  });

  it("실제 DB 오류는 비가용 결과로 바꾸지 않는다", async () => {
    const currentFetch = neonConfig.fetchFunction;
    neonConfig.fetchFunction = async () => { throw new Error("합성 DB 전송 실패"); };
    try {
      await expect(getPublicApplicationFormDetail(formId)).rejects.toThrow();
    } finally {
      neonConfig.fetchFunction = currentFetch;
    }
  });
});
