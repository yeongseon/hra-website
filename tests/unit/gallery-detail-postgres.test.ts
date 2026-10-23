// @vitest-environment node
/**
 * 갤러리 상세의 사진 순서·공개 필드·원자 조회수 갱신을 소유 PostgreSQL에서 확인합니다.
 * 합성 행만 사용하고 Neon 요청은 임시 Unix 소켓으로 한정합니다.
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

import { getPublicGalleryDetail, incrementPublicGalleryViewCount } from "@/features/gallery/detail/service";

const bin = process.env.HRA_TEST_PG_BIN;
const id = "86000000-0000-4000-8000-000000000001";
const missingId = "86000000-0000-4000-8000-000000000099";

describe.skipIf(!bin)("갤러리 상세 실제 PostgreSQL 관계·조회수", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
  let postCount = 0;
  const previousFetch = neonConfig.fetchFunction;
  const previousEndpoint = neonConfig.fetchEndpoint;

  beforeAll(() => {
    cluster = createQaPostgres(bin);
    cluster.sql(`
      CREATE TABLE galleries (
        id uuid PRIMARY KEY, title varchar(300) NOT NULL, description text,
        cover_image_url text, view_count integer NOT NULL, created_at timestamp NOT NULL,
        updated_at timestamp NOT NULL
      );
      CREATE TABLE gallery_images (
        id uuid PRIMARY KEY, gallery_id uuid NOT NULL REFERENCES galleries(id),
        url text NOT NULL, alt varchar(255), "order" integer NOT NULL,
        created_at timestamp NOT NULL
      );
      INSERT INTO galleries(id,title,description,cover_image_url,view_count,created_at,updated_at) VALUES
        ('${id}','합성 상세 앨범','공개 설명','private://unused-cover',7,'2026-10-01',now());
      INSERT INTO gallery_images(id,gallery_id,url,alt,"order",created_at) VALUES
        ('87000000-0000-4000-8000-000000000001','${id}','https://public.invalid/late.jpg','늦은 사진',1,'2026-10-02'),
        ('87000000-0000-4000-8000-000000000002','${id}','https://public.invalid/first.jpg','첫 사진',1,'2026-10-01'),
        ('87000000-0000-4000-8000-000000000003','${id}','https://public.invalid/last.jpg',NULL,2,'2026-10-01');
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body));
      // Drizzle의 기존 updatedAt 자동 갱신은 허용하되 읽기 응답의 비표시 열은 차단합니다.
      const statement = String(request.query);
      if (/^\s*select\b/i.test(statement) && /cover_image_url|updated_at/i.test(statement)) {
        throw new Error("비표시 열 조회 금지");
      }
      postCount++;
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

  it("사진 order·createdAt 순서로 상세 표시 필드만 반환한다", async () => {
    const gallery = await getPublicGalleryDetail(id);
    expect(gallery).toMatchObject({ id, title: "합성 상세 앨범", description: "공개 설명", viewCount: 7 });
    expect(gallery?.images.map((image) => image.alt)).toEqual(["첫 사진", "늦은 사진", null]);
    expect(gallery?.images.map((image) => image.url)).toEqual([
      "https://public.invalid/first.jpg", "https://public.invalid/late.jpg", "https://public.invalid/last.jpg",
    ]);
    expect(Object.keys(gallery ?? {})).toEqual(["id", "title", "description", "viewCount", "images"]);
    expect(Object.keys(gallery?.images[0] ?? {})).toEqual(["id", "url", "alt"]);
    expect(JSON.stringify(gallery)).not.toMatch(/private:|coverImageUrl|createdAt|updatedAt|"order"/);
  });

  it("잘못된·없는 ID는 조회수를 갱신하지 않는다", async () => {
    postCount = 0;
    expect(await getPublicGalleryDetail("invalid-id")).toBeNull();
    await incrementPublicGalleryViewCount("invalid-id");
    expect(postCount).toBe(0);
    expect(await getPublicGalleryDetail(missingId)).toBeNull();
  });

  it("동시 조회수 두 번은 현재 값에 각각 원자적으로 더한다", async () => {
    await Promise.all([incrementPublicGalleryViewCount(id), incrementPublicGalleryViewCount(id)]);
    expect((await getPublicGalleryDetail(id))?.viewCount).toBe(9);
  });
});
