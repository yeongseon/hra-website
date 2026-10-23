/**
 * 신규 DB 검증용 Drizzle export 후보의 생성 원본과 수동 namespace 차이만 검사합니다.
 * DB나 운영 환경 파일을 읽지 않고, 원본 변경이 생기면 후보 재검토를 요구합니다.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { exportQaSchemaSql } from "../../tests/support/qa-schema-export.mjs";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const candidatePath = join(root, "scripts/db/candidates/db-fresh/schema-export.sql");
const rawDigest = "24688481f7454df960537b5aebfd65d3818449c2839f4a1dcea8863e30a6d1f3";
const candidateDigest = "0ed45733612ec170785c51975ecb3c9ed5c790e6d54027684fe7df1d90d3a107";
const schemaDigest = "6873861242b429974f917f6a60d51f6b585daa357a1d63dd7e5448c464d51e77";
const sha256 = value => createHash("sha256").update(value).digest("hex");

test("생성 export 후보는 검토한 CREATE TABLE 대상 45개만 public으로 한정한다", () => {
  // 설치된 Drizzle 도구의 현재 export를 다시 얻어 schema/tool 변경을 먼저 감지합니다.
  const raw = exportQaSchemaSql(root);
  assert.equal(sha256(raw), rawDigest);
  const candidate = readFileSync(candidatePath, "utf8");
  assert.equal(sha256(candidate), candidateDigest);
  const headerEnd = candidate.indexOf('CREATE TYPE "public".');
  assert.ok(headerEnd > 0);
  assert.match(candidate.slice(0, headerEnd), /^-- 신규 owned-local DB 설치 검증 전용/m);
  assert.equal(sha256(readFileSync(join(root, "src/lib/db/schema.ts"))), schemaDigest);
  assert.ok(candidate.slice(0, headerEnd).includes(`src/lib/db/schema.ts (SHA256 ${schemaDigest})`));
  const rawLines = raw.split("\n");
  const candidateLines = candidate.slice(headerEnd).split("\n");
  assert.equal(candidateLines.length, rawLines.length);

  // 차이를 문장 대상으로만 제한합니다. 함수·제약 본문은 바이트 단위로 동일해야 합니다.
  const qualified = new Set();
  for (let index = 0; index < rawLines.length; index++) {
    if (rawLines[index] === candidateLines[index]) continue;
    const match = /^CREATE TABLE "([a-z_]+)" \($/.exec(rawLines[index]);
    assert.ok(match, `검토되지 않은 export 변경: ${index + 1}행`);
    assert.equal(candidateLines[index], `CREATE TABLE "public"."${match[1]}" (`);
    assert.ok(!qualified.has(match[1]));
    qualified.add(match[1]);
  }
  assert.equal(qualified.size, 45);
  assert.ok(qualified.has("users"));
  assert.ok(qualified.has("academic_students"));
  assert.ok(qualified.has("recruitment_settings"));
});
