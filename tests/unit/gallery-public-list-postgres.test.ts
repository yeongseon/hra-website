// @vitest-environment node
/**
 * 갤러리 앨범 목록의 관계 조회·사진 수·작성일 순서를 소유 PostgreSQL에서 확인합니다.
 * 합성 사진만 사용하고 Neon 요청은 임시 Unix 소켓으로 제한합니다.
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

import { listPublicGalleryAlbums } from "@/features/gallery/public-list/service";

const bin = process.env.HRA_TEST_PG_BIN;

describe.skipIf(!bin)("공개 갤러리 목록 실제 PostgreSQL 관계", () => {
  let cluster: ReturnType<typeof createQaPostgres> | undefined;
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
        ('84000000-0000-4000-8000-000000000001','새 앨범','내부 설명','https://public.invalid/cover.jpg',5,'2026-10-03',now()),
        ('84000000-0000-4000-8000-000000000002','중간 앨범','내부 설명',NULL,3,'2026-10-02',now()),
        ('84000000-0000-4000-8000-000000000003','빈 앨범','내부 설명','https://public.invalid/unused.jpg',1,'2026-10-01',now());
      INSERT INTO gallery_images(id,gallery_id,url,"order",created_at) VALUES
        ('85000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','private://image-a',0,now()),
        ('85000000-0000-4000-8000-000000000002','84000000-0000-4000-8000-000000000001','private://image-b',1,now()),
        ('85000000-0000-4000-8000-000000000003','84000000-0000-4000-8000-000000000002','private://image-c',0,now());
    `);

    const transport = createPsqlTransport(cluster.environment);
    neonConfig.fetchEndpoint = qaNeonEndpoint;
    neonConfig.fetchFunction = async (input: unknown, options: RequestInit) => {
      if (String(input) !== qaNeonEndpoint || options.method !== "POST" ||
        new Headers(options.headers).get("Neon-Connection-String") !== qaDatabaseUrl) {
        throw new Error("격리 SQL 범위 이외 요청 차단");
      }
      const request = JSON.parse(String(options.body));
      if (/\b(?:description|updated_at)\b/i.test(JSON.stringify(request))) {
        throw new Error("비표시 열 조회 금지");
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

  it("작성일 역순으로 앨범·사진 수를 반환하고 이미지 ID·원본 URL은 제외한다", async () => {
    const albums = await listPublicGalleryAlbums();
    expect(albums.map((album) => [album.title, album.imageCount, album.viewCount])).toEqual([
      ["새 앨범", 2, 5], ["중간 앨범", 1, 3], ["빈 앨범", 0, 1],
    ]);
    expect(albums[2].coverImageUrl).toBe("https://public.invalid/unused.jpg");
    expect(Object.keys(albums[0])).toEqual(["id", "title", "coverImageUrl", "viewCount", "imageCount"]);
    expect(JSON.stringify(albums)).not.toMatch(/private:|description|updatedAt|createdAt|galleryId|"images"/);
  });
});
