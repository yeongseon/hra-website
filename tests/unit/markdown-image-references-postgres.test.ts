// @vitest-environment node
/**
 * 실제 PostgreSQL에서 본문 이미지 참조 뷰를 확인합니다 (#88).
 * 임시 클러스터만 사용하며 운영 DB와 Blob에는 접근하지 않습니다.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const bin = process.env.HRA_TEST_PG_BIN;
const url = "https://example.public.blob.vercel-storage.com/markdown-images/owned.png";
const otherUrl = "https://example.public.blob.vercel-storage.com/markdown-images/other.png";
const assetId = "11111111-1111-4111-8111-111111111111";
const otherAssetId = "22222222-2222-4222-8222-222222222222";
const contentId = "33333333-3333-4333-8333-333333333333";

describe.skipIf(!bin)("본문 이미지 참조 뷰 PostgreSQL 검증", () => {
  let root: string;
  let started = false;
  let psqlArgs: string[];
  const program = (name: string) => join(bin!, name);
  const run = (statement: string) => execFileSync(program("psql"), psqlArgs, {
    input: statement,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  }).trim();

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "hra-markdown-assets-"));
    execFileSync(program("initdb"), ["-D", join(root, "data"), "-A", "trust", "-U", "hra_test", "--no-locale", "-E", "UTF8"], { stdio: "pipe" });
    execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-l", join(root, "server.log"),
      "-o", `-h '' -k ${root} -p 55440`, "-w", "start"], { stdio: "pipe" });
    started = true;
    psqlArgs = ["-X", "-h", root, "-p", "55440", "-U", "hra_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];

    run(`
      CREATE TABLE markdown_image_assets (
        id uuid PRIMARY KEY, url text UNIQUE NOT NULL,
        created_at timestamptz NOT NULL, deleted_at timestamptz
      );
      CREATE TABLE notices (id uuid PRIMARY KEY, content text NOT NULL);
      CREATE TABLE class_logs (id uuid PRIMARY KEY, content text NOT NULL);
      CREATE TABLE weekly_texts (id uuid PRIMARY KEY, body text, file_url text);
      CREATE TABLE alumni_stories (id uuid PRIMARY KEY, content text NOT NULL, image_url text);
      CREATE TABLE report_templates (id uuid PRIMARY KEY, body text NOT NULL);
      CREATE TABLE recruitment_settings (id uuid PRIMARY KEY, details_markdown text, poster_image_url text);
      CREATE TABLE press_articles (id uuid PRIMARY KEY, image_url text);
      CREATE TABLE cohorts (id uuid PRIMARY KEY, image_url text);
      CREATE TABLE faculty (id uuid PRIMARY KEY, image_url text);
      CREATE TABLE galleries (id uuid PRIMARY KEY, cover_image_url text);
      CREATE TABLE notice_attachments (id uuid PRIMARY KEY, url text);
      CREATE TABLE class_log_images (id uuid PRIMARY KEY, url text);
      CREATE TABLE weekly_text_images (id uuid PRIMARY KEY, url text);
      CREATE TABLE gallery_images (id uuid PRIMARY KEY, url text);
      CREATE TABLE alumni_story_images (id uuid PRIMARY KEY, url text);
      CREATE TABLE class_materials (id uuid PRIMARY KEY, file_url text);
      CREATE TABLE guidebooks (id uuid PRIMARY KEY, file_url text);
      CREATE TABLE application_forms (id uuid PRIMARY KEY, description text);
    `);
    run(readFileSync("scripts/sql/markdown-image-references.sql", "utf8"));
    run(`INSERT INTO markdown_image_assets VALUES
      ('${assetId}', '${url}', now() - interval '31 days', NULL),
      ('${otherAssetId}', '${otherUrl}', now() - interval '31 days', NULL);`);
  }, 30000);

  beforeEach(() => {
    run("TRUNCATE notices, class_logs, press_articles;");
    run("UPDATE markdown_image_assets SET deleted_at = NULL;");
  });

  afterAll(() => {
    try {
      if (started) execFileSync(program("pg_ctl"), ["-D", join(root, "data"), "-m", "immediate", "-w", "stop"], { stdio: "pipe" });
    } finally {
      if (root) rmSync(root, { recursive: true, force: true });
    }
  });

  it("공유 URL은 모든 콘텐츠 참조가 사라질 때까지 남는다", () => {
    run(`INSERT INTO notices VALUES ('${contentId}', '![사진](${url})');
      INSERT INTO press_articles VALUES ('${contentId}', '${url}');`);
    expect(run(`SELECT count(*) FROM markdown_image_references WHERE asset_id = '${assetId}';`)).toBe("2");

    run(`DELETE FROM notices WHERE id = '${contentId}';`);
    expect(run(`SELECT count(*) FROM markdown_image_references WHERE asset_id = '${assetId}';`)).toBe("1");

    run(`UPDATE press_articles SET image_url = NULL WHERE id = '${contentId}';`);
    expect(run(`SELECT count(*) FROM markdown_image_references WHERE asset_id = '${assetId}';`)).toBe("0");
  });

  it("동시 편집의 오래된 본문이 아닌 현재 저장된 참조를 읽는다", () => {
    run(`INSERT INTO class_logs VALUES ('${contentId}', '${url}');`);
    run(`UPDATE class_logs SET content = '${otherUrl}' WHERE id = '${contentId}';`);
    expect(run(`SELECT count(*) FROM markdown_image_references WHERE asset_id = '${assetId}';`)).toBe("0");
    expect(run(`SELECT count(*) FROM markdown_image_references WHERE asset_id = '${otherAssetId}';`)).toBe("1");
  });

  it("등록되지 않은 기존 URL에는 소유권을 부여하지 않는다", () => {
    run(`INSERT INTO notices VALUES ('${contentId}', 'https://example.public.blob.vercel-storage.com/markdown-images/legacy.png');`);
    expect(run("SELECT count(*) FROM markdown_image_references WHERE source_type = 'notices';")).toBe("0");
  });

  it("30일 지난 소유 파일 중 참조가 없는 것만 정리 후보로 고른다", () => {
    run(`INSERT INTO notices VALUES ('${contentId}', '${otherUrl}');`);
    const candidates = run(`
      SELECT a.id FROM markdown_image_assets a
      WHERE a.deleted_at IS NULL
        AND a.created_at < now() - interval '30 days'
        AND NOT EXISTS (
          SELECT 1 FROM markdown_image_references r WHERE r.asset_id = a.id
        )
      ORDER BY a.id;
    `);
    expect(candidates).toBe(assetId);

    run(`UPDATE markdown_image_assets SET deleted_at = now() WHERE id = '${assetId}';`);
    expect(run(`SELECT count(*) FROM markdown_image_assets WHERE deleted_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM markdown_image_references r WHERE r.asset_id = markdown_image_assets.id);`)).toBe("0");
  });
});
