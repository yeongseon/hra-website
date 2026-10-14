/**
 * 과거 카카오 로그인에서 생성한 임시 이메일로 OAuth 바인딩을 복원합니다.
 * 이메일이 정확한 `kakao_<숫자>@oauth.placeholder` 형식이고 비밀번호가 없으며
 * 바인딩 두 필드가 모두 비어 있는 계정만 대상으로 합니다.
 *
 * 기본 실행은 읽기 전용입니다. 실제 적용에는 --apply와 --expect=<검증한 건수>가
 * 필요합니다. 이메일만 일치하는 일반 계정은 연결하지 않습니다.
 */
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const expectedArg = args.find((arg) => arg.startsWith("--expect="));
const unknown = args.filter((arg) => arg !== "--apply" && !arg.startsWith("--expect="));
if (unknown.length > 0 || args.filter((arg) => arg.startsWith("--expect=")).length > 1) {
  throw new Error("지원하지 않는 인자 또는 중복된 예상 건수입니다.");
}

const expected = expectedArg ? Number(expectedArg.slice("--expect=".length)) : null;
if (apply && (!Number.isSafeInteger(expected) || expected <= 0)) {
  throw new Error("실제 적용에는 양의 정수 --expect=<건수>가 필요합니다.");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL 환경변수가 필요합니다.");
}

const sql = neon(process.env.DATABASE_URL);
const legacy = await sql`
  SELECT id, email
  FROM users
  WHERE password_hash IS NULL
    AND oauth_provider IS NULL
    AND oauth_provider_account_id IS NULL
`;
const placeholder = /^kakao_([0-9]+)@oauth\.placeholder$/;
const bindings = legacy.map((row) => {
  const match = placeholder.exec(row.email);
  if (!match) throw new Error("임시 이메일 형식이 아닌 미연결 소셜 계정이 있어 중단합니다.");
  return { id: row.id, accountId: match[1] };
});

if (new Set(bindings.map((binding) => binding.accountId)).size !== bindings.length) {
  throw new Error("카카오 식별자가 중복되어 중단합니다.");
}

const existing = await sql`
  SELECT oauth_provider_account_id
  FROM users
  WHERE oauth_provider = 'kakao'
`;
const alreadyBound = new Set(existing.map((row) => row.oauth_provider_account_id));
if (bindings.some((binding) => alreadyBound.has(binding.accountId))) {
  throw new Error("기존 카카오 바인딩과 충돌하여 중단합니다.");
}

console.log(`미연결 소셜 계정 ${legacy.length}개: 정확한 카카오 임시 이메일 형식, 식별자 중복·충돌 없음`);
if (!apply) {
  console.log("읽기 전용 점검 완료. 계정은 변경하지 않았습니다.");
  process.exit(0);
}
if (legacy.length !== expected) {
  throw new Error("예상 건수와 달라 계정을 변경하지 않았습니다.");
}

// 복구에 필요한 ID와 이전 바인딩 상태만 로컬 제한 권한 파일에 저장합니다.
// 이메일과 이름은 백업 파일에도 적지 않습니다.
const backupDirectory = mkdtempSync(join(tmpdir(), "hra-kakao-binding-"));
chmodSync(backupDirectory, 0o700);
const backupPath = join(backupDirectory, "previous-bindings.json");
writeFileSync(
  backupPath,
  JSON.stringify(bindings.map((binding) => ({ id: binding.id, oauthProvider: null, oauthProviderAccountId: null }))),
  { encoding: "utf8", mode: 0o600, flag: "wx" },
);

// 재검증·변경·영향 행 수 확인은 하나의 PostgreSQL 문장에서 실행합니다.
// 검증이나 UPDATE가 일부라도 실패하면 DO 문 전체가 롤백됩니다.
const block = `
DO $backfill$
DECLARE
  total_count integer;
  candidate_count integer;
  affected_count integer;
BEGIN
  SELECT count(*) INTO total_count FROM users
  WHERE password_hash IS NULL AND oauth_provider IS NULL AND oauth_provider_account_id IS NULL;

  SELECT count(*) INTO candidate_count FROM users
  WHERE password_hash IS NULL AND oauth_provider IS NULL AND oauth_provider_account_id IS NULL
    AND email ~ '^kakao_[0-9]+@oauth[.]placeholder$';

  IF total_count <> ${expected} OR candidate_count <> ${expected} THEN
    RAISE EXCEPTION 'legacy candidate count changed';
  END IF;

  IF EXISTS (
    SELECT 1 FROM users
    WHERE password_hash IS NULL AND oauth_provider IS NULL AND oauth_provider_account_id IS NULL
      AND email ~ '^kakao_[0-9]+@oauth[.]placeholder$'
    GROUP BY substring(email FROM 7 FOR length(email) - 24)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'duplicate kakao account id';
  END IF;

  IF EXISTS (
    SELECT 1 FROM users old_user JOIN users bound_user
      ON bound_user.oauth_provider = 'kakao'
      AND bound_user.oauth_provider_account_id = substring(old_user.email FROM 7 FOR length(old_user.email) - 24)
    WHERE old_user.password_hash IS NULL
      AND old_user.oauth_provider IS NULL AND old_user.oauth_provider_account_id IS NULL
      AND old_user.email ~ '^kakao_[0-9]+@oauth[.]placeholder$'
  ) THEN
    RAISE EXCEPTION 'existing kakao binding conflict';
  END IF;

  UPDATE users SET oauth_provider = 'kakao',
    oauth_provider_account_id = substring(email FROM 7 FOR length(email) - 24)
  WHERE password_hash IS NULL AND oauth_provider IS NULL AND oauth_provider_account_id IS NULL
    AND email ~ '^kakao_[0-9]+@oauth[.]placeholder$';
  GET DIAGNOSTICS affected_count = ROW_COUNT;

  IF affected_count <> ${expected} THEN
    RAISE EXCEPTION 'affected row count changed';
  END IF;
END
$backfill$`;

await sql`${sql.unsafe(block)}`;

const repaired = await sql`
  SELECT id, email, oauth_provider, oauth_provider_account_id
  FROM users
  WHERE email ~ '^kakao_[0-9]+@oauth[.]placeholder$'
`;
const byId = new Map(repaired.map((row) => [row.id, row]));
if (!bindings.every((binding) => {
  const row = byId.get(binding.id);
  return row?.oauth_provider === "kakao" && row.oauth_provider_account_id === binding.accountId;
})) {
  throw new Error("적용 후 바인딩 검증 실패: 제한 권한 백업으로 복구를 검토하세요.");
}

console.log(`카카오 기존 계정 바인딩 ${bindings.length}개 복원 및 검증 완료`);
console.log(`복구용 ID 백업: ${backupPath}`);
