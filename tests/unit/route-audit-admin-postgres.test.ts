// @vitest-environment node
/**
 * 관리자 경로 감사에서 수정한 저장 원자성·참조 보존·없는 대상 처리를 영구 회귀로 검증합니다.
 * 실제 액션·Drizzle·격리 PostgreSQL을 연결하며 실패 응답 뒤 DB 불변과 이동 방지를 확인합니다.
 * 운영 설정은 읽지 않고 합성 자료만 사용합니다. SQL·매개변수·오류 원문은 출력하지 않습니다.
 * 관련 근거: #108 순서 저장, #130 없는 대상 처리, #144 학적 참조 보존.
 */
import { readFileSync } from "node:fs";
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  database: undefined as NeonHttpDatabase<typeof schema> | undefined,
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); },
}));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));

import { reorderPressArticles, updatePressArticle } from "@/features/press/actions";
import { updateFaqItem } from "@/features/faq/actions";
import { deleteUser } from "@/features/users/actions";

// 이 식별자와 링크는 재현용 합성 값이며 실제 계정·콘텐츠와 관련이 없습니다.
const actor = "10000000-0000-4000-8000-000000000001";
const target = "10000000-0000-4000-8000-000000000002";
const first = "30000000-0000-4000-8000-000000000001";
const second = "30000000-0000-4000-8000-000000000002";
const missing = "30000000-0000-4000-8000-000000000099";
const student = "40000000-0000-4000-8000-000000000001";

type SqlEvidence = { rowCount?: number; code?: string; constraint?: string };
type ActionOutcome =
  | { kind: "returned"; value: unknown }
  | { kind: "redirect"; path: string }
  | { kind: "thrown" };

/** 오류 원문에는 Drizzle 쿼리가 포함되므로 비민감 결과 분류만 반환합니다. */
async function outcome(action: () => Promise<unknown>): Promise<ActionOutcome> {
  try {
    return { kind: "returned", value: await action() };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("REDIRECT:/admin/")) {
      return { kind: "redirect", path: error.message.slice("REDIRECT:".length) };
    }
    return { kind: "thrown" };
  }
}

describe("관리자 CRUD 수정 계약: 실제 PostgreSQL 회귀", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  const statements: SqlEvidence[] = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    const bin = process.env.HRA_TEST_PG_BIN;
    if (!bin) throw new Error("회귀 검증에는 HRA_TEST_PG_BIN 지정이 필요합니다. 생략 실행은 허용하지 않습니다.");
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TYPE user_role AS ENUM ('ADMIN','FACULTY','MEMBER','PENDING');
      CREATE TABLE cohorts(id uuid PRIMARY KEY);
      CREATE TABLE users(id uuid PRIMARY KEY, role user_role NOT NULL,
        cohort_id uuid REFERENCES cohorts(id), session_version integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE press_articles(id uuid PRIMARY KEY, title varchar(300) NOT NULL,
        source varchar(200) NOT NULL, url text NOT NULL, published_at timestamp NOT NULL,
        description text, image_url text, "order" integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE faq_items(id uuid PRIMARY KEY, question text NOT NULL, answer text NOT NULL,
        "order" integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now());
    `);
    // 실제 #144 migration으로 참조 제약을 설치하여 임의로 만든 FK와 구분합니다.
    cluster.sql(readFileSync("scripts/migrate-academic-students.sql", "utf8"));
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
          new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      try {
        const result = await transport(JSON.parse(String(options.body)));
        statements.push({ rowCount: result.rowCount });
        return Response.json(result);
      } catch (error) {
        // 실제 PostgreSQL SQLSTATE와 제약 이름만 Neon 오류 응답으로 전달합니다.
        const code = error instanceof Error && "code" in error && typeof error.code === "string"
          ? error.code : "QA_TRANSPORT_ERROR";
        const constraint = error instanceof Error && "constraint" in error && typeof error.constraint === "string"
          ? error.constraint : undefined;
        statements.push({ code, ...(constraint ? { constraint } : {}) });
        return Response.json({ message: "격리 SQL 실행 거부", code, constraint }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    statements.length = 0;
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    cluster.sql(`
      TRUNCATE cohort_enrollments, academic_students, users, press_articles, faq_items;
      INSERT INTO users(id,role) VALUES('${actor}','ADMIN'),('${target}','MEMBER');
      INSERT INTO press_articles(id,title,source,url,published_at,"order") VALUES
        ('${first}','합성 기사 가','검증','https://route-audit.invalid/a',now(),1),
        ('${second}','합성 기사 나','검증','https://route-audit.invalid/b',now(),2);
      INSERT INTO faq_items(id,question,answer,"order") VALUES('${first}','합성 질문','합성 답변',1);
    `);
  });

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  it("없는 ID가 포함된 순서 저장은 0행을 변경하고 기존 순서를 보존합니다 (#108)", async () => {
    const before = cluster.sql('SELECT "order" FROM press_articles ORDER BY id');
    const rowsBefore = cluster.sql("SELECT count(*) FROM press_articles");
    expect(await reorderPressArticles([missing, second, first])).toEqual({
      success: false, message: "일부 항목을 저장하지 못했습니다.",
    });
    const after = cluster.sql('SELECT "order" FROM press_articles ORDER BY id');
    expect(statements).toEqual([{ rowCount: 0 }]);
    expect(rowsBefore).toBe("2");
    expect(cluster.sql("SELECT count(*) FROM press_articles")).toBe("2");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(before).toBe("1\n2");
    expect(after, "실패한 순서 저장은 기존 순서를 보존해야 합니다").toBe(before);
  });

  it("학적 참조 회원 삭제는 예외 대신 안전한 실패 결과를 반환하고 레코드를 보존합니다 (#144)", async () => {
    cluster.sql(`INSERT INTO academic_students(id,user_id,display_name) VALUES('${student}','${target}','합성 학생');`);
    const counts = () => cluster.sql("SELECT (SELECT count(*) FROM users),(SELECT count(*) FROM academic_students)");
    const before = counts();
    const result = await outcome(() => deleteUser(target));
    expect(before).toBe("2|1");
    expect(counts()).toBe(before);
    expect(statements).toEqual([
      { rowCount: 1 },
      { code: "23001", constraint: "academic_students_user_id_users_id_fk" },
    ]);
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(result, "참조 제약 거부는 한국어 실패 결과로 반환해야 합니다")
      .toMatchObject({ kind: "returned", value: { success: false, message: expect.stringMatching(/[가-힣]/) } });
    expect(JSON.stringify(result)).not.toMatch(/23001|23503|academic_students_user_id_users_id_fk|DELETE FROM|격리 SQL/);
  });

  it.each(["press", "faq"] as const)("없는 %s 수정은 0행 변경 뒤 이동·캐시 무효화 없이 실패합니다 (#130)", async (feature) => {
    const form = new FormData();
    const table = feature === "press" ? "press_articles" : "faq_items";
    if (feature === "press") {
      form.set("title", "합성 수정 기사");
      form.set("source", "검증 출처");
      form.set("url", "https://route-audit.invalid/updated");
      form.set("publishedAt", "2026-10-16");
    } else {
      form.set("question", "합성 수정 질문");
      form.set("answer", "합성 수정 답변");
    }
    // 테이블 이름은 위 고정 분기에서만 정하며 사용자 입력을 연결하지 않습니다.
    const snapshot = () => cluster.sql(`SELECT row_to_json(t)::text FROM ${table} t ORDER BY id`);
    const before = snapshot();
    const result = await outcome(() => feature === "press"
      ? updatePressArticle(missing, form) : updateFaqItem(missing, form));
    expect(statements).toEqual([{ rowCount: 0 }]);
    expect(snapshot()).toBe(before);
    expect(cluster.sql(`SELECT count(*) FROM ${table}`)).toBe(feature === "press" ? "2" : "1");
    expect(result, "없는 수정 대상은 이동하지 않고 실패 결과를 반환해야 합니다")
      .toMatchObject({ kind: "returned", value: { success: false, message: expect.stringMatching(/[가-힣]/) } });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
