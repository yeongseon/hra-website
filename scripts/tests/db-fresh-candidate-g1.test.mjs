/**
 * G1 원문과 검토된 로컬 후보의 정확한 byte delta만 검사합니다.
 * 고정 원문/행을 대조하는 테스트이며 SQL parser·runtime wrapper-strip·DB 적용기는 아닙니다.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const inventory = JSON.parse(readFileSync(resolve(repository, 'scripts/db/source-inventory.json'), 'utf8'));
const headerLines = 10;
// 파일별로 사람이 확인한 외부 경계와 statement timeout 행입니다. 함수/DO 내부 BEGIN은 대상이 아닙니다.
const reviewed = [
  { id: 'students', begin: 4, commit: 137, statement: 7, expected: "SET LOCAL statement_timeout = '60s';" },
  { id: 'enrollment-links', begin: 3, commit: 213, statement: 6, expected: "SET LOCAL statement_timeout = '30s';", lock: 5, expectedLock: "SET LOCAL lock_timeout = '10s';" },
  { id: 'roster', begin: 3, commit: 125, statement: null, expected: null },
  { id: 'assignments', begin: 3, commit: 316, statement: 6, expected: "SET LOCAL statement_timeout = '60s';" },
  { id: 'submissions', begin: 3, commit: 360, statement: 6, expected: "SET LOCAL statement_timeout = '60s';" },
  { id: 'assignment-actions', begin: 3, commit: 181, statement: 6, expected: "SET LOCAL statement_timeout = '60s';" },
  { id: 'upload-authorizations', begin: 3, commit: 222, statement: 6, expected: "SET LOCAL statement_timeout='60s';" },
  { id: 'submission-finalization', begin: 3, commit: 89, statement: 6, expected: "SET LOCAL statement_timeout = '60s';" },
  { id: 'submission-file-reads', begin: 3, commit: 83, statement: 6, expected: "SET LOCAL statement_timeout = '60s';" },
];
const originPath = row => `scripts/migrate-academic-${row.id}.sql`;
const candidatePath = row => `scripts/db/candidates/db-fresh/g1-${row.id}.sql`;
function readRegular(file) {
  try { const path = resolve(repository, file); if (!lstatSync(path).isFile() || realpathSync(path) !== path) throw new Error('LINK'); return readFileSync(path); }
  catch { throw new Error('FRESH_G1_SOURCE_READ_FAILED'); }
}
/** 임의 SQL을 해석하지 않고 승인된 두 경계·정해진 timeout 행만 비교 대상으로 인정합니다. */
function reviewBytes(row, source, candidate) {
  const declared = inventory.sql.find(entry => entry.path === originPath(row));
  const sha = createHash('sha256').update(source).digest('hex');
  if (!declared || declared.sha256 !== sha) return 'FRESH_G1_SOURCE_HASH';
  const sourceText = source.toString('utf8');
  if (!Buffer.from(sourceText).equals(source) || !sourceText.endsWith('\n')) return 'FRESH_G1_SOURCE_ENCODING';
  const lines = sourceText.split('\n'); lines.pop();
  const removed = [row.begin, row.commit, ...(row.statement === null ? [] : [row.statement]), ...(row.lock === undefined ? [] : [row.lock])].sort((a, b) => a - b);
  if (lines[row.begin - 1] !== 'BEGIN;' || lines[row.commit - 1] !== 'COMMIT;' || row.statement !== null && lines[row.statement - 1] !== row.expected || row.lock !== undefined && lines[row.lock - 1] !== row.expectedLock) return 'FRESH_G1_REVIEW_LOCATION';
  const candidateLines = candidate.toString('utf8').split('\n');
  if (candidateLines[1] !== `-- 원본 참조: ${originPath(row)}` || candidateLines[2] !== `-- 검토 원본 SHA256: ${sha}` || candidateLines[headerLines - 1] !== '') return 'FRESH_G1_PROVENANCE';
  const mappings = []; let start = 1;
  for (const stop of [...removed, lines.length + 1]) {
    if (start < stop) mappings.push(`${start}-${stop - 1}→${start + headerLines - removed.filter(line => line < start).length}-${stop - 1 + headerLines - removed.filter(line => line < stop - 1).length}`);
    start = stop + 1;
  }
  if (candidateLines[4] !== `-- 원본→후보 보존 행: ${mappings.join('; ')}`) return 'FRESH_G1_LINE_MAP';
  const body = Buffer.from(candidateLines.slice(headerLines).join('\n'));
  // 검토된 위치를 제외한 모든 원본 byte는 주석·공백·함수 body까지 그대로 보존해야 합니다.
  const expected = Buffer.from(lines.filter((_, index) => !removed.includes(index + 1)).join('\n') + '\n');
  return body.equals(expected) ? 'FRESH_G1_REVIEWED' : 'FRESH_G1_UNREVIEWED_DELTA';
}
test('후보 대응표는 inventory G1 순서 전체와 정확히 일치', () => {
  assert.equal(JSON.stringify(reviewed.map(originPath)) === JSON.stringify(inventory.g1Order), true, 'FRESH_G1_ORDER_MISMATCH');
});
for (const row of reviewed) {
  test(`${row.id}: Git 원본 SHA·명시 경계·후보 행 및 허용 byte delta 확인`, () => {
    try { execFileSync('git', ['ls-files', '--error-unmatch', '--', originPath(row)], { cwd: repository, stdio: 'ignore' }); }
    catch { assert.fail('FRESH_G1_LEGACY_NOT_TRACKED'); }
    assert.equal(reviewBytes(row, readRegular(originPath(row)), readRegular(candidatePath(row))), 'FRESH_G1_REVIEWED');
  });
}
test('미검토 함수·권한·timeout body 변경은 byte 대조에서 실패', () => {
  for (const row of reviewed) {
    const source = readRegular(originPath(row)), candidate = readRegular(candidatePath(row));
    const changed = Buffer.concat([candidate, Buffer.from('-- synthetic unreviewed body change\n')]);
    assert.equal(reviewBytes(row, source, changed), 'FRESH_G1_UNREVIEWED_DELTA');
  }
});
test('원본 변경을 현재 candidate 검토 SHA로 소급 수용하지 않음', () => {
  const row = reviewed[0];
  assert.equal(reviewBytes(row, Buffer.concat([readRegular(originPath(row)), Buffer.from('-- synthetic change\n')]), readRegular(candidatePath(row))), 'FRESH_G1_SOURCE_HASH');
});
test('보존한 lock/search_path를 조용히 없애는 timeout 완화는 미검토 delta', () => {
  const row = reviewed[0], source = readRegular(originPath(row)), candidate = readRegular(candidatePath(row));
  assert.equal(reviewBytes(row, source, Buffer.from(candidate.toString('utf8').replace("SET LOCAL lock_timeout = '5s';\n", ''))), 'FRESH_G1_UNREVIEWED_DELTA');
  assert.equal(reviewBytes(row, source, Buffer.from(candidate.toString('utf8').replace('SET LOCAL search_path = public, pg_catalog;\n', ''))), 'FRESH_G1_UNREVIEWED_DELTA');
});
test('승인된 enrollment-links 10s 한 행만 제외하고 나머지 7개 5s lock은 보존', () => {
  const body = row => readRegular(candidatePath(row)).toString('utf8').split('\n').slice(headerLines).join('\n');
  assert.equal(body(reviewed[1]).includes("SET LOCAL lock_timeout = '10s';"), false);
  const preserved = reviewed.filter(row => row.statement !== null && row.lock === undefined);
  assert.equal(preserved.length, 7);
  for (const row of preserved) {
    const line = readRegular(originPath(row)).toString('utf8').split('\n')[row.id === 'students' ? 5 : 4];
    assert.equal(["SET LOCAL lock_timeout = '5s';", "SET LOCAL lock_timeout='5s';"].includes(line), true);
    assert.equal(body(row).includes(line + '\n'), true);
  }
});

/** 정책 byte 검사는 실제 SQL 실행 없이 함수·권한·FK·index·namespace의 미검토 변경을 거부합니다. */
for (const [id, needle, replacement] of [
  ['assignments', 'public.guard_academic_assignment() RETURNS trigger', 'public.guard_academic_assignment() RETURNS integer'],
  ['upload-authorizations', 'REVOKE ALL ON FUNCTION public.issue_academic_assignment_upload', '-- removed permission guard '],
  ['submissions', 'DEFERRABLE INITIALLY DEFERRED', 'NOT DEFERRABLE'],
  ['students', 'CREATE INDEX IF NOT EXISTS cohort_enrollments_cohort_status_idx', '-- removed index '],
  ['assignments', 'CREATE TABLE IF NOT EXISTS public.assignments', 'CREATE TABLE IF NOT EXISTS pg_catalog.assignments'],
]) {
  test(`${id}: 개별 정의·권한·namespace mutation을 미검토 delta로 거부`, () => {
    const row = reviewed.find(entry => entry.id === id), source = readRegular(originPath(row)), candidate = readRegular(candidatePath(row));
    const lines = candidate.toString('utf8').split('\n'), header = lines.slice(0, headerLines).join('\n') + '\n', body = lines.slice(headerLines).join('\n');
    assert.equal(body.includes(needle), true, 'FRESH_G1_MUTATION_FIXTURE_MISSING');
    assert.equal(reviewBytes(row, source, Buffer.from(header + body.replace(needle, replacement))), 'FRESH_G1_UNREVIEWED_DELTA');
  });
}
