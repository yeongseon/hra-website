// @vitest-environment node
/**
 * 언론보도·FAQ 수정의 성공·없는 대상·저장 직전 삭제를 실제 SQL 결과로 검증합니다.
 * 실제 Neon SDK와 Drizzle을 유지하고 합성 DB의 유닉스 소켓으로만 SQL을 전송합니다.
 * 오류 원문·SQL·매개변수는 assertion 출력에 포함하지 않습니다.
 */
import { neon, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint } from "../support/neon-psql-transport.mjs";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn<(path: string) => never>(),
  database: undefined as NeonHttpDatabase<typeof schema> | undefined,
}));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", () => ({ logServerError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import { updatePressArticle } from "@/features/press/actions";
import { updateFaqItem } from "@/features/faq/actions";

type Feature = "press" | "faq";
type Outcome =
  | { kind: "returned"; value: unknown }
  | { kind: "redirect"; path: string }
  | { kind: "thrown" };
const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const target = "20000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000002";
const missing = "20000000-0000-4000-8000-000000000099";

/** redirect와 예상하지 않은 예외를 원문 없이 분류합니다. */
async function outcome(action: () => Promise<unknown>): Promise<Outcome> {
  try {
    return { kind: "returned", value: await action() };
  } catch (error) {
    if (error instanceof Error && error.message === "QA_REDIRECT"
      && "path" in error && typeof error.path === "string") {
      return { kind: "redirect", path: error.path };
    }
    return { kind: "thrown" };
  }
}

/** 폼은 실제 액션의 검증을 통과하는 합성 값으로만 구성합니다. */
function formData(feature: Feature) {
  const form = new FormData();
  if (feature === "press") {
    form.set("title", "합성 수정 기사");
    form.set("source", "검증 출처");
    form.set("url", "https://missing-update.invalid/updated");
    form.set("publishedAt", "2026-10-17");
  } else {
    form.set("question", "합성 수정 질문");
    form.set("answer", "합성 수정 답변");
  }
  return form;
}

const tableName = (feature: Feature) => feature === "press" ? "press_articles" : "faq_items";
const update = (feature: Feature, id: string) => feature === "press"
  ? updatePressArticle(id, formData(feature)) : updateFaqItem(id, formData(feature));

describe.skipIf(!bin)("관리자 수정 대상 소멸의 실제 PostgreSQL 회귀", () => {
  let cluster: ReturnType<typeof createQaPostgres>;
  let beforeUpdate: (() => void) | undefined;
  const updates: number[] = [];
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;
  const snapshot = (feature: Feature, id?: string) => cluster.sql(`
    SELECT row_to_json(t) FROM ${tableName(feature)} t
    ${id ? `WHERE id='${id}'` : ""} ORDER BY id;
  `);

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE press_articles(id uuid PRIMARY KEY, title varchar(300) NOT NULL,
        source varchar(200) NOT NULL, url text NOT NULL, published_at timestamp NOT NULL,
        description text, image_url text, "order" integer NOT NULL DEFAULT 0,
        updated_at timestamp NOT NULL DEFAULT now());
      CREATE TABLE faq_items(id uuid PRIMARY KEY, question text NOT NULL, answer text NOT NULL,
        "order" integer NOT NULL DEFAULT 0, updated_at timestamp NOT NULL DEFAULT now());
    `);
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST"
        || new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const payload = JSON.parse(String(options.body));
      const isUpdate = /^\s*update\s+"(?:press_articles|faq_items)"/i.test(payload.query);
      // 실제 UPDATE가 전달된 뒤 실행되기 전에 다른 연결의 삭제 커밋을 완료합니다.
      // 존재 여부 조회가 추가되어도 그 조회 뒤의 저장 경합을 검증합니다.
      if (isUpdate && beforeUpdate) {
        const execute = beforeUpdate;
        beforeUpdate = undefined;
        execute();
      }
      try {
        const result = await transport(payload);
        if (isUpdate) updates.push(result.rowCount);
        return Response.json(result);
      } catch (error) {
        const code = error instanceof Error && "code" in error && typeof error.code === "string"
          && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : "QA_TRANSPORT_ERROR";
        return Response.json({ message: "격리 SQL 실행 실패", code }, { status: 400 });
      }
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks();
    updates.length = 0;
    beforeUpdate = undefined;
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    mocks.redirect.mockImplementation(path => {
      throw Object.assign(new Error("QA_REDIRECT"), { path });
    });
    cluster.sql(`
      TRUNCATE press_articles, faq_items;
      INSERT INTO press_articles(id,title,source,url,published_at,"order") VALUES
        ('${target}','합성 기사 가','검증','https://missing-update.invalid/a','2026-10-16',1),
        ('${other}','합성 기사 나','검증','https://missing-update.invalid/b','2026-10-16',2);
      INSERT INTO faq_items(id,question,answer,"order") VALUES
        ('${target}','합성 질문 가','합성 답변 가',1),
        ('${other}','합성 질문 나','합성 답변 나',2);
    `);
  });

  afterAll(() => {
    neonConfig.fetchFunction = previousFetch;
    neonConfig.fetchEndpoint = previousEndpoint;
    mocks.database = undefined;
    cluster?.close();
  });

  describe.each(["press", "faq"] as const)("%s 수정", feature => {
    it("정상 대상은 실제 한 행을 저장하고 기존 성공 경로로 이동합니다", async () => {
      const untouched = snapshot(feature, other);
      expect(await outcome(() => update(feature, target)))
        .toEqual({ kind: "redirect", path: `/admin/${feature}` });
      expect(updates).toEqual([1]);
      expect(snapshot(feature, other)).toBe(untouched);
      const saved = feature === "press"
        ? cluster.sql(`SELECT title,source,url,published_at::date,"order" FROM press_articles WHERE id='${target}';`)
        : cluster.sql(`SELECT question,answer,"order" FROM faq_items WHERE id='${target}';`);
      expect(saved).toBe(feature === "press"
        ? "합성 수정 기사|검증 출처|https://missing-update.invalid/updated|2026-10-17|1"
        : "합성 수정 질문|합성 수정 답변|1");
      expect(mocks.revalidatePath.mock.calls.map(([path]) => path).sort())
        .toEqual([`/admin/${feature}`, `/${feature}`].sort());
      expect(mocks.redirect).toHaveBeenCalledOnce();
    });

    it("없는 대상의 UPDATE 0행은 한국어 실패로 반환하고 성공 처리를 하지 않습니다", async () => {
      const before = snapshot(feature);
      const result = await outcome(() => update(feature, missing));
      expect(updates).toEqual([0]);
      expect(snapshot(feature)).toBe(before);
      expect.soft(result).toMatchObject({ kind: "returned", value: {
        success: false, message: expect.stringMatching(/[가-힣]/),
      } });
      expect.soft(mocks.redirect).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });

    it("별도 연결에서 저장 직전 삭제가 커밋되면 UPDATE 0행을 실패로 반환합니다", async () => {
      const untouched = snapshot(feature, other);
      expect(cluster.sql(`SELECT count(*) FROM ${tableName(feature)} WHERE id='${target}';`)).toBe("1");
      let deletionCommitted = false;
      beforeUpdate = () => {
        expect(cluster.sql(`DELETE FROM ${tableName(feature)} WHERE id='${target}' RETURNING id;`)).toBe(target);
        deletionCommitted = true;
      };
      const result = await outcome(() => update(feature, target));
      expect(deletionCommitted).toBe(true);
      expect(updates).toEqual([0]);
      expect(snapshot(feature, target)).toBe("");
      expect(snapshot(feature, other)).toBe(untouched);
      expect.soft(result).toMatchObject({ kind: "returned", value: {
        success: false, message: expect.stringMatching(/[가-힣]/),
      } });
      expect.soft(mocks.redirect).not.toHaveBeenCalled();
      expect(mocks.revalidatePath).not.toHaveBeenCalled();
    });
  });
});
