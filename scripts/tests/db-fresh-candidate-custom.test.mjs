/**
 * owned-local custom 후보의 검토된 정확한 행 변경만 byte 단위로 허용한다.
 * 원본 SQL을 실행·변경하지 않고 inventory의 원천 SHA와 별도 후보 SHA를 대조한다.
 * 함수 본문·ACL·FK·index·view SELECT를 자동 변환하지 않으며 SQL 원문을 실패 출력에 넣지 않는다.
 * 후보는 전체 engine/reference 대조와 timeout 실패 gate가 끝나기 전 설치 완료 증거가 아니다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const root = new URL("../../", import.meta.url);
const inventory = JSON.parse(readFileSync(new URL("scripts/db/source-inventory.json", root), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const removalReason = "외부 transaction은 S2 파일 경계가 소유하고 statement60s 대신 더 강한 engine7500ms를 사용한다. lock5s는 보존한다. 운영 timeout 동등성을 주장하지 않는다.";
const qualificationReason = "pg_catalog,public helper에서 DDL 생성 대상만 public로 고정한다. 함수 본문·proconfig·뷰 SELECT는 보존한다.";

// 각 tuple은 원본 행·원문·후보 대체문·후보 행이다. 번호는 1부터 세며 삭제 행은 다음 행/EOF 경계다.
// 제외/수식한 행과 이유만 명시하며 범용 SQL 변환기는 만들지 않는다.
const reviews = [
  {
    source: "scripts/migrate-protect-application-answers.sql", candidate: "custom-protect-application-answers.sql",
    digest: "1f2084557bf9e1c551df9f9bb1a055d0b14dc180f81c92b2486c73f47d42a73b", reason: removalReason,
    edits: [[4, "BEGIN;", null, 4], [6, "SET LOCAL statement_timeout = '60s';", null, 5], [43, "COMMIT;", null, 41]],
  },
  {
    source: "scripts/migrate-protect-application-submissions.sql", candidate: "custom-protect-application-submissions.sql",
    digest: "3ad5348bfc69ec59eab10e0d2be3becfe85ff9e5d6b125de77acb8171f1668f9", reason: removalReason,
    edits: [[4, "BEGIN;", null, 4], [6, "SET LOCAL statement_timeout = '60s';", null, 5], [45, "COMMIT;", null, 43]],
  },
  {
    source: "scripts/migrate-atomic-application-questions.sql", candidate: "custom-atomic-application-questions.sql",
    digest: "a719e9b4be6b997277ccf604ed8f6dbb0da4e41ccc1c42d2dfbcbbc5e4f71ee0", reason: qualificationReason,
    edits: [[4, "CREATE OR REPLACE FUNCTION save_application_form_questions(", "CREATE OR REPLACE FUNCTION public.save_application_form_questions(", 4]],
  },
  {
    source: "scripts/migrate-assert-application-question-revision.sql", candidate: "custom-assert-application-question-revision.sql",
    digest: "93dd16b7d0b5f22083f6ae5fccee0b0d7b2eccebc39ab7b00f9952f36ff1b10c", reason: qualificationReason,
    edits: [[3, "CREATE OR REPLACE FUNCTION assert_application_form_questions_revision(", "CREATE OR REPLACE FUNCTION public.assert_application_form_questions_revision(", 3]],
  },
  {
    source: "scripts/sql/rate-limit-reservations.sql", candidate: "custom-rate-limit-reservations.sql",
    digest: "b68aae1755468f752756fd97e8eed43bcebb1fdc7f141ebe801be1af915231ae",
    reason: "외부 transaction과 마지막 COMMIT 앞 빈 구분 행만 제외하고 table·function·FK·index ON 대상을 public로 수식한다. 마지막 빈 행은 EOF 공백 경고 방지다. index 이름은 ON 대상 table의 schema를 따르므로 PG 문법상 이름 자체를 수식하지 않는다. 함수 본문/proconfig는 보존한다.",
    edits: [
      [3, "BEGIN;", null, 3],
      [5, "CREATE TABLE IF NOT EXISTS rate_limit_events (", "CREATE TABLE IF NOT EXISTS public.rate_limit_events (", 4],
      [11, "  submission_id uuid REFERENCES application_submissions(id) ON DELETE CASCADE", "  submission_id uuid REFERENCES public.application_submissions(id) ON DELETE CASCADE", 10],
      [15, "  ON rate_limit_events (scope, key_hash, attempted_at);", "  ON public.rate_limit_events (scope, key_hash, attempted_at);", 14],
      [17, "  ON rate_limit_events (attempted_at);", "  ON public.rate_limit_events (attempted_at);", 16],
      [19, "  ON rate_limit_events (submission_id);", "  ON public.rate_limit_events (submission_id);", 18],
      [23, "CREATE OR REPLACE FUNCTION reserve_rate_limit(", "CREATE OR REPLACE FUNCTION public.reserve_rate_limit(", 22],
      [99, "", null, 98],
      [100, "COMMIT;", null, 98],
    ],
  },
  {
    source: "scripts/sql/markdown-image-references.sql", candidate: "custom-markdown-image-references.sql",
    digest: "e27a178317b4acafe1f394c3e051054cf7eed467a61c61ad957bdb2b100c511c", reason: qualificationReason,
    edits: [[4, "CREATE OR REPLACE VIEW markdown_image_references AS", "CREATE OR REPLACE VIEW public.markdown_image_references AS", 4]],
  },
  {
    source: "scripts/migrate-287-rate-limit-reservation-index.sql", candidate: "custom-rate-limit-reservation-index.sql",
    digest: "8bcc03505ac957506c5472d2094c6f379535c65bdf2271275b158f1c31e2d6d0", reason: removalReason,
    edits: [[4, "BEGIN;", null, 4], [6, "SET LOCAL statement_timeout = '60s';", null, 5], [69, "COMMIT;", null, 67]],
  },
];

for (const [index, review] of reviews.entries()) test(`custom 후보 ${index + 1}의 승인된 원본 행 delta와 고정 SHA를 확인한다`, () => {
  const original = readFileSync(new URL(review.source, root));
  const candidate = readFileSync(new URL(`scripts/db/candidates/db-fresh/${review.candidate}`, root));
  const authority = inventory.sql.find(entry => entry.path === review.source);
  assert.equal(Boolean(authority), true, "CUSTOM_SOURCE_REGISTERED");
  assert.equal(hash(original), authority.sha256, "CUSTOM_SOURCE_SHA_MATCH");
  assert.equal(hash(candidate), review.digest, "CUSTOM_CANDIDATE_REVIEWED_SHA");
  const lines = original.toString("utf8").split("\n");
  for (const [line, expected, replacement, candidateLine] of review.edits) {
    // assertion은 hash만 비교하므로 잘못된 원본 행의 SQL·함수 본문을 출력하지 않는다.
    assert.equal(hash(lines[line - 1]), hash(expected), "CUSTOM_REVIEWED_SOURCE_LINE");
    assert.equal(candidateLine, line - review.edits.filter(([previous, , value]) => previous < line && value === null).length, "CUSTOM_REVIEWED_CANDIDATE_LINE");
    lines[line - 1] = replacement;
  }
  const expected = Buffer.from(lines.filter(line => line !== null).join("\n"));
  assert.equal(hash(candidate), hash(expected), "CUSTOM_ONLY_REVIEWED_DELTA");
  assert.equal(review.reason.length > 30, true, "CUSTOM_REVIEW_REASON_RECORDED");
});
