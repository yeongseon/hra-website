// @vitest-environment node
/**
 * 자료 교체·삭제와 유지보수 GC를 실제 PostgreSQL·합성 Blob 상태에 연결합니다 (#290).
 * 실제 서버 액션·원장·현재 참조 뷰·정리 명령을 실행하며 DB 응답 유실은 커밋 전후에 주입합니다.
 * 운영 DB·Blob에는 접근하지 않고 기존 격리 PostgreSQL 전송기와 스키마 내보내기를 재사용합니다.
 */
import { readFileSync } from "node:fs";
import { neon, neonConfig } from "@neondatabase/serverless";
import { BlobNotFoundError } from "@vercel/blob";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/lib/db/schema";
import { createQaPostgres } from "../support/resource-qa-postgres.mjs";
import { createPsqlTransport, qaDatabaseUrl, qaNeonEndpoint, sqlLiteral } from "../support/neon-psql-transport.mjs";
import { exportQaSchemaSql } from "../support/qa-schema-export.mjs";
import { syntheticPng } from "../support/synthetic-image";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), put: vi.fn(), del: vi.fn(), log: vi.fn(),
  database: undefined as NeonHttpDatabase<typeof schema> | undefined }));
vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/errors", () => ({ logServerError: mocks.log }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("시험 로그인 이동"); } }));
vi.mock("@/lib/blob-host", () => ({ projectBlobHost: "replacementqa.public.blob.vercel-storage.com" }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, del: mocks.del, BlobNotFoundError: class extends Error {} }));
vi.mock("@/lib/db", () => ({ get db() {
  if (!mocks.database) throw new Error("격리 DB 준비 전 호출");
  return mocks.database;
} }));
import { updateClassLog, deleteClassLog } from "@/features/class-logs/actions";
import { updateWeeklyText, deleteWeeklyText } from "@/features/weekly-texts/actions";

const bin = process.env.HRA_TEST_PG_BIN;
const actor = "10000000-0000-4000-8000-000000000001";
const id = "20000000-0000-4000-8000-000000000001";
const origin = "https://replacementqa.public.blob.vercel-storage.com";
const oldImage = `${origin}/legacy/shared.png`, oldDocument = `${origin}/legacy/shared.pdf`;
// UUID 모양의 서버 경로여도 원장에 없으면 기존 미등록 파일입니다. 경로 기반 소유권 추정을 방지합니다.
const legacyImage = `${origin}/class-logs/30000000-0000-4000-8000-000000000001.png`;
const legacyDocument = `${origin}/weekly-texts/30000000-0000-4000-8000-000000000002.pdf`;
const initialObjects = [oldImage, oldDocument, legacyImage, legacyDocument];
type Fault = { pattern: RegExp; committed: boolean };
type Upload = { url: string; reserved: boolean; options: { access: string; contentType?: string; addRandomSuffix?: boolean; allowOverwrite?: boolean; token?: string } };

describe.skipIf(!bin)("교체 업로드 원장·현재 참조·GC PostgreSQL 회귀", () => {
  let cluster: ReturnType<typeof createQaPostgres>, objects: Set<string>, uploads: Upload[];
  let fault: Fault | undefined, lostUpload = 0, deleteFailure: string | undefined, cleanupRun = 0;
  const oldEndpoint = neonConfig.fetchEndpoint, oldFetch = neonConfig.fetchFunction;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(exportQaSchemaSql());
    cluster.sql(readFileSync("scripts/sql/markdown-image-references.sql", "utf8"));
    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
          new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) throw new Error("격리 SQL 범위 이외 전송 차단");
      const payload = JSON.parse(String(options.body));
      const fail = fault?.pattern.test(payload.query) ? fault : undefined;
      if (fail) fault = undefined;
      if (fail && !fail.committed) throw new Error("시험 DB 커밋 전 실패");
      const result = await transport(payload);
      if (fail) throw new Error("시험 DB 커밋 후 응답 유실");
      return Response.json(result);
    };
    mocks.database = drizzle(neon(qaDatabaseUrl), { schema });
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "false");
    vi.stubEnv("DATABASE_URL", qaDatabaseUrl);
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "synthetic-replacement-token");
    vi.stubEnv("HRA_CONTENT_WRITES_STOPPED", "1");
  }, 30_000);

  beforeEach(() => {
    vi.clearAllMocks(); fault = undefined; lostUpload = 0; deleteFailure = undefined;
    objects = new Set(initialObjects); uploads = [];
    mocks.auth.mockResolvedValue({ user: { id: actor, role: "ADMIN" } });
    cluster.sql(`TRUNCATE users, class_logs, weekly_texts, notices, markdown_image_assets CASCADE;
      INSERT INTO users(id,name,email,role) VALUES('${actor}','합성 관리자','replacement@qa.invalid','ADMIN');
      INSERT INTO class_logs(id,title,content,class_date,author_id) VALUES('${id}','기존 일지','기존 본문',now(),'${actor}');
      INSERT INTO class_log_images(class_log_id,url) VALUES('${id}','${oldImage}'),('${id}','${legacyImage}');
      INSERT INTO weekly_texts(id,title,file_url,file_name) VALUES('${id}','기존 문서','${oldDocument}','기존.pdf');
      INSERT INTO markdown_image_assets(url,uploaded_by_id,created_at) VALUES
        ('${oldImage}','${actor}',now()-interval '31 days'),('${oldDocument}','${actor}',now()-interval '31 days');
      INSERT INTO notices(title,content,author_id) VALUES('공유 파일 참조','${oldImage} ${oldDocument}','${actor}');`);
    mocks.put.mockImplementation(async (path: string, _body: unknown, options: Upload["options"]) => {
      const host = options.access === "private" ? "replacementqa.private.blob.vercel-storage.com" : new URL(origin).hostname;
      const url = `https://${host}/${path}${options.addRandomSuffix ? `-random${uploads.length}` : ""}`;
      const reserved = cluster.sql(`SELECT count(*) FROM markdown_image_assets WHERE url=${sqlLiteral(url)}`) === "1";
      uploads.push({ url, reserved, options }); objects.add(url);
      if (uploads.length === lostUpload) throw new Error("시험 Blob 생성 후 응답 유실");
      return { url };
    });
    mocks.del.mockImplementation(async (url: string) => {
      if (url === deleteFailure) throw new Error("시험 Blob 삭제 실패");
      if (!objects.delete(url)) throw new BlobNotFoundError();
    });
  });

  afterAll(() => {
    neonConfig.fetchEndpoint = oldEndpoint; neonConfig.fetchFunction = oldFetch;
    mocks.database = undefined; vi.unstubAllEnvs(); vi.restoreAllMocks(); cluster?.close();
  });

  /** 검증 가능한 실제 파일 헤더와 기존 폼 계약을 사용합니다. */
  function form(kind: "class" | "weekly", count = 1) {
    const value = new FormData();
    for (const [name, text] of Object.entries({ title: "합성 교체", content: "합성 본문", body: "합성 본문", classDate: "2026-10-21" })) value.set(name, text);
    if (kind === "class") for (let index = 0; index < count; index++) value.append("images", new File([syntheticPng()], `개인파일-${index}.png`, { type: "image/png" }));
    else value.set("file", new File(["%PDF-1.7\n시험"], "개인파일.pdf", { type: "application/pdf" }));
    return value;
  }
  const replace = (kind: "class" | "weekly", count = 1) => kind === "class" ? updateClassLog(id, form(kind, count)) : updateWeeklyText(id, form(kind));
  const remove = (kind: "class" | "weekly") => kind === "class" ? deleteClassLog(id) : deleteWeeklyText(id);
  const references = (url: string) => Number(cluster.sql(`SELECT count(*) FROM markdown_image_references r JOIN markdown_image_assets a ON a.id=r.asset_id WHERE a.url=${sqlLiteral(url)}`));
  const owned = (url: string) => cluster.sql(`SELECT count(*) FROM markdown_image_assets WHERE url=${sqlLiteral(url)} AND deleted_at IS NULL`) === "1";

  /** 기존 30일 정책과 쓰기 중단 전제를 그대로 사용해 실제 GC 명령을 실행합니다. */
  async function cleanup() {
    cluster.sql("UPDATE markdown_image_assets SET created_at=now()-interval '31 days'");
    const argv = process.argv, exitCode = process.exitCode;
    process.argv = ["node", "cleanup-markdown-image-assets.mjs", "--apply"]; process.exitCode = undefined;
    const info = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const cleanupModuleUrl = new URL("../../scripts/cleanup-markdown-image-assets.mjs", import.meta.url).href;
      await import(`${cleanupModuleUrl}?replacement=${++cleanupRun}`);
      return process.exitCode;
    } finally { process.argv = argv; process.exitCode = exitCode; info.mockRestore(); error.mockRestore(); }
  }

  it.each(["class", "weekly"] as const)("%s 교체는 UUID URL을 먼저 예약하며 등록된 기존 파일과 미등록 레거시를 구분한다", async kind => {
    expect((await replace(kind)).success).toBe(true);
    expect(uploads).toHaveLength(1);
    expect(uploads[0].reserved).toBe(true);
    expect(uploads[0].url).toMatch(/\/(?:class-logs|weekly-texts)\/[0-9a-f-]{36}\.(?:png|pdf)$/);
    expect(uploads[0].options).toMatchObject({ access: "public", addRandomSuffix: false, allowOverwrite: false });
    expect(uploads[0].options.contentType).toBe(kind === "class" ? "image/png" : "application/pdf");
    expect(references(uploads[0].url)).toBe(1);
    expect(objects.has(oldImage)).toBe(true); expect(objects.has(oldDocument)).toBe(true);
    if (kind === "class") expect(objects.has(legacyImage)).toBe(false);
    else expect(cluster.sql("SELECT file_name FROM weekly_texts")).toBe("개인파일.pdf");
  });

  it.each(["class", "weekly"] as const)("%s 콘텐츠 커밋 후 응답 유실·재시도·공유 참조를 지나도 참조 객체를 보존한다", async kind => {
    fault = { pattern: kind === "class" ? /^insert into "class_log_images"/i : /^update "weekly_texts"/i, committed: true };
    expect((await replace(kind)).success).toBe(false);
    const first = uploads[0].url;
    expect(owned(first)).toBe(true); expect(references(first)).toBe(1); expect(objects.has(first)).toBe(true);
    cluster.sql(`UPDATE notices SET content=content||' '||${sqlLiteral(first)}`);
    expect((await replace(kind)).success).toBe(true);
    expect(uploads[1].url).not.toBe(first);
    expect(objects.has(first)).toBe(true);
    expect(await cleanup()).not.toBe(1);
    expect(objects.has(first)).toBe(true); expect(objects.has(uploads[1].url)).toBe(true);
  }, 15_000);

  it.each(["class", "weekly"] as const)("%s 콘텐츠 커밋 전 실패 객체는 원장에 남고 유지보수 GC만 정리한다", async kind => {
    fault = { pattern: kind === "class" ? /^insert into "class_log_images"/i : /^update "weekly_texts"/i, committed: false };
    expect((await replace(kind)).success).toBe(false);
    const url = uploads[0].url;
    expect(owned(url)).toBe(true); expect(references(url)).toBe(0); expect(objects.has(url)).toBe(true);
    expect(await cleanup()).not.toBe(1);
    expect(objects.has(url)).toBe(false); expect(owned(url)).toBe(false);
    expect(objects.has(oldImage)).toBe(true); expect(objects.has(oldDocument)).toBe(true);
  }, 15_000);

  it("수업일지 부분 업로드의 생성 후 응답 유실·GC 삭제 실패·재시도를 원장으로 연결한다", async () => {
    lostUpload = 2;
    expect((await replace("class", 2)).success).toBe(false);
    expect(uploads).toHaveLength(2);
    for (const { url } of uploads) { expect(owned(url)).toBe(true); expect(objects.has(url)).toBe(true); expect(references(url)).toBe(0); }
    deleteFailure = uploads[0].url;
    expect(await cleanup()).toBe(1);
    expect(owned(deleteFailure)).toBe(true); expect(objects.has(deleteFailure)).toBe(true);
    deleteFailure = undefined;
    expect(await cleanup()).not.toBe(1);
    for (const { url } of uploads) { expect(owned(url)).toBe(false); expect(objects.has(url)).toBe(false); }
  }, 15_000);

  it("수업일지 기존 이미지 행 삭제 실패는 기존·새 참조 객체를 모두 보존한다", async () => {
    fault = { pattern: /^delete from "class_log_images"/i, committed: false };
    expect((await replace("class")).success).toBe(false);
    expect(references(uploads[0].url)).toBe(1);
    expect(cluster.sql("SELECT count(*) FROM class_log_images")).toBe("3");
    expect(mocks.del).not.toHaveBeenCalled();
    expect(await cleanup()).not.toBe(1);
    expect(objects.has(uploads[0].url)).toBe(true); expect(objects.has(oldImage)).toBe(true);
  }, 15_000);

  it.each(["class", "weekly"] as const)("%s 전체 삭제 후에도 새 UUID 객체의 다른 콘텐츠 참조를 보존한다", async kind => {
    expect((await replace(kind)).success).toBe(true);
    const url = uploads[0].url;
    cluster.sql(`UPDATE notices SET content=content||' '||${sqlLiteral(url)}`);
    mocks.del.mockClear();
    expect((await remove(kind)).success).toBe(true);
    expect(mocks.del).not.toHaveBeenCalled();
    expect(await cleanup()).not.toBe(1);
    expect(objects.has(url)).toBe(true);
  }, 15_000);

  it.each(["class", "weekly"] as const)("%s 전체 삭제에서도 원장 등록 레거시는 보존하고 미등록 레거시의 기존 정리를 유지한다", async kind => {
    expect((await remove(kind)).success).toBe(true);
    expect(objects.has(oldImage)).toBe(true); expect(objects.has(oldDocument)).toBe(true);
    if (kind === "class") expect(objects.has(legacyImage)).toBe(false);
    else {
      cluster.sql(`INSERT INTO weekly_texts(id,title,file_url) VALUES('${id}','미등록 파일','${legacyDocument}')`);
      expect((await remove(kind)).success).toBe(true);
      expect(objects.has(legacyDocument)).toBe(false);
    }
  });

  it.each([
    ["class", "replace"], ["weekly", "replace"], ["class", "remove"], ["weekly", "remove"],
  ] as const)("%s %s의 원장 조회 실패 시 삭제를 건너뛰고 고정 문맥으로 오류를 기록한다", async (kind, operation) => {
    fault = { pattern: /^select "url" from "markdown_image_assets"/i, committed: false };
    expect((await (operation === "replace" ? replace(kind) : remove(kind))).success).toBe(true);
    expect(mocks.del).not.toHaveBeenCalled();
    expect(mocks.log).toHaveBeenCalledWith("owned-blob/lookup", expect.any(Error), { candidateCount: kind === "class" ? 2 : 1 });
  });

  it.each(["class", "weekly"] as const)("%s 삭제 표시가 있는 기존 원장 URL도 즉시 삭제 대상으로 삼지 않는다", async kind => {
    cluster.sql("UPDATE markdown_image_assets SET deleted_at=now()");
    expect((await remove(kind)).success).toBe(true);
    expect(objects.has(oldImage)).toBe(true); expect(objects.has(oldDocument)).toBe(true);
  });

  it("주차별 문서·사진 직접 업로드의 기존 보존 규칙은 원장 조회와 별개로 유지한다", async () => {
    const document = `${origin}/resource-uploads/weekly-texts/${actor}/${id}/qa.pdf`;
    const image = `${origin}/weekly-text-images/${id}/${actor}/qa.png`;
    objects.add(document); objects.add(image);
    cluster.sql(`UPDATE weekly_texts SET file_url=${sqlLiteral(document)};
      INSERT INTO weekly_text_images(weekly_text_id,url) VALUES('${id}',${sqlLiteral(image)});`);
    expect((await remove("weekly")).success).toBe(true);
    expect(mocks.del).not.toHaveBeenCalled();
    expect(objects.has(document)).toBe(true); expect(objects.has(image)).toBe(true);
  });

  it.each([false, true])("원장 예약 응답 실패(실제 커밋=%s)는 객체 생성 전에 멈추고 미생성 예약도 GC가 정리한다", async committed => {
    fault = { pattern: /^insert into "markdown_image_assets"/i, committed };
    expect((await replace("weekly")).success).toBe(false);
    expect(mocks.put).not.toHaveBeenCalled();
    expect(cluster.sql("SELECT count(*) FROM markdown_image_assets")).toBe(committed ? "3" : "2");
    expect(await cleanup()).not.toBe(1);
    expect(cluster.sql("SELECT count(*) FROM markdown_image_assets WHERE deleted_at IS NOT NULL")).toBe(committed ? "1" : "0");
  }, 15_000);

  it("비공개 자료 교체도 실제 원장 URL과 저장소 토큰을 유지한다", async () => {
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "true");
    vi.stubEnv("RESOURCE_PRIVATE_BLOB_HOST", "replacementqa.private.blob.vercel-storage.com");
    vi.stubEnv("RESOURCE_PRIVATE_READ_WRITE_TOKEN", "synthetic-private-token");
    try {
      expect((await replace("weekly")).success).toBe(true);
      expect(uploads[0].reserved).toBe(true);
      expect(uploads[0].options).toMatchObject({ access: "private", token: "synthetic-private-token", contentType: "application/pdf" });
      expect(references(uploads[0].url)).toBe(1);
    } finally { vi.stubEnv("RESOURCE_PRIVATE_BLOB_ENABLED", "false"); }
  });
});
