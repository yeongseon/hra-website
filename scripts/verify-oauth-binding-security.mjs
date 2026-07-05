/**
 * OAuth binding 보안 운영 스모크 검증 스크립트 (#67)
 *
 * 이 스크립트의 역할 (정확한 위치 정의):
 *   "이번 배포에서 실제 프로덕션 DB 위에서 signIn 콜백의 IO 조합이 예상대로 동작하는가"
 *   에 대한 **운영 스모크 체크**. CI 회귀 진리치가 아니다. 회귀 방지의 진짜 근거는:
 *     - tests/unit/auth-jwt-session.test.ts (162 unit tests) - decideOAuthSignIn 결정 트리
 *     - DB 상의 UNIQUE/CHECK 제약 - fail-closed 안전망
 *   이 스크립트는 그 위에 얹는 "실제 DB IO 경계에서 잘 붙어 있는가" 확인용.
 *
 * 검증 항목:
 *   1) 원 BLOCK 시나리오가 실제 DB IO 경계에서도 봉쇄되는가.
 *   2) 정상 경로 (신규/재로그인) 는 여전히 통과하는가.
 *   3) CHECK/UNIQUE 제약이 signIn 콜백과 마찰 없이 공존하는가.
 *   4) 이중 SELECT 우선순위 (boundUser > emailUser) 가 실제 IO 에서도 유지되는가.
 *
 * ⚠️ MIRROR 근사(近似) 특성:
 *   pureDecide() 는 auth-session.ts::decideOAuthSignIn 을 재구현한 근사치이고,
 *   simulateSignIn() 도 auth.ts::signIn 의 IO 조합을 재구현한 근사치다. 기본값 처리
 *   (예: name/image fallback) 등 일부 비-보안 분기는 정확히 일치하지 않을 수 있다.
 *   보안 결정 트리 (5-way) 는 정확히 일치시키되, 원본 함수 변경 시 이 파일도 함께
 *   갱신해야 한다. 자동 drift 검사는 하지 않으므로 코드 리뷰 시 사람이 확인해야 한다.
 *
 * 안전성 (프로덕션 DB 에 대해 실행 가능하도록 설계):
 *   - 모든 fixture email 은 `.invalid` TLD (RFC 6761 예약 도메인) 로, 실제 사용자와 충돌 불가능.
 *   - 각 fixture id 는 crypto.randomUUID() 로, 실제 UUID 와 충돌 확률 무시 가능.
 *   - 삽입된 모든 fixture id 를 `insertedIds` 에 추적해, 예외/크래시 시에도 finally 에서
 *     ID 기반 cleanup 을 먼저 시도한 뒤 nonce LIKE fallback 을 실행한다 (scenario 7 처럼
 *     nonce prefix 를 갖지 않는 placeholder email 도 안전하게 정리).
 *   - cleanup 이 실패해도 수동 정리용 SQL 을 stderr 에 출력한다.
 *   - INSERT/UPDATE/DELETE 는 모두 fixture id 또는 nonce LIKE 로 스코프됨. 실제 사용자
 *     row 를 절대로 건드리지 않는다.
 *
 * 사용법:
 *   npm run verify:oauth-binding-security
 *   # 또는 직접:
 *   node --env-file=.env scripts/verify-oauth-binding-security.mjs
 *
 * 환경변수:
 *   DATABASE_URL - Neon Postgres 연결 문자열 (필수)
 */

import { neon } from "@neondatabase/serverless";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}
const sql = neon(DATABASE_URL);

// 이 실행 시점의 nonce. cleanup 필터 및 fixture email prefix 로 사용된다.
const NONCE = `oauth-verify-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const emailFor = suffix => `${NONCE}-${suffix}@oauth-binding-verify.invalid`;

// 이 실행에서 삽입된 모든 fixture id 를 추적한다. nonce prefix 를 갖지 않는 email
// (예: scenario 7 의 kakao placeholder) 도 안전하게 cleanup 되도록 하는 이중 안전장치.
// insertFixture() 와 simulateSignIn() 의 INSERT branch 에서 항상 add() 한다.
const insertedIds = new Set();

// ---------------------------------------------------------------------------
// decideOAuthSignIn 미러 (src/lib/auth-session.ts 원본의 5-way 결정 트리를 재구현).
// 보안 결정 로직은 원본과 정확히 일치시켜야 하며, 원본 변경 시 이 파일도 함께 갱신한다.
// 자동 drift 검사는 없으므로 코드 리뷰 시 사람이 원본과 대조하여 확인해야 한다.
// ---------------------------------------------------------------------------
function hasLocalCredentials(user) {
  return typeof user.passwordHash === "string" && user.passwordHash.length > 0;
}

function pureDecide({ boundUser, emailUser }) {
  if (boundUser) return { kind: "allow-existing", userId: boundUser.id };
  if (!emailUser) return { kind: "allow-new" };
  if (hasLocalCredentials(emailUser)) return { kind: "block", reason: "local-account" };
  if (emailUser.oauth_provider === null && emailUser.oauth_provider_account_id === null) {
    return { kind: "block", reason: "legacy-unbound" };
  }
  return { kind: "block", reason: "provider-mismatch" };
}

// ---------------------------------------------------------------------------
// auth.ts::signIn 콜백 미러 (SELECT boundUser + SELECT emailUser + IO 를 재구현).
// 보안 관점 (결정 트리, INSERT/UPDATE 대상 row) 는 원본과 일치시키되, name/image
// 기본값 처리 등 일부 비-보안 분기는 근사치일 수 있다.
// ---------------------------------------------------------------------------
async function simulateSignIn({ provider, providerAccountId, providedEmail, name, image }) {
  const email =
    providedEmail || `${provider}_${providerAccountId}@oauth.placeholder`;

  const [boundRows, emailRows] = await Promise.all([
    sql`SELECT id, name, image, role, password_hash, oauth_provider, oauth_provider_account_id
        FROM users
        WHERE oauth_provider = ${provider} AND oauth_provider_account_id = ${providerAccountId}
        LIMIT 1`,
    sql`SELECT id, name, image, role, password_hash, oauth_provider, oauth_provider_account_id
        FROM users
        WHERE email = ${email}
        LIMIT 1`,
  ]);

  const boundUser = boundRows[0]
    ? { ...boundRows[0], passwordHash: boundRows[0].password_hash }
    : null;
  const emailUser = emailRows[0]
    ? { ...emailRows[0], passwordHash: emailRows[0].password_hash }
    : null;

  const decision = pureDecide({ boundUser, emailUser });

  if (decision.kind === "block") {
    return { decision, effect: "redirect:/login?error=OAuthAccountNotLinked", boundUser, emailUser };
  }

  if (decision.kind === "allow-new") {
    const newId = crypto.randomUUID();
    // cleanup 추적: 이 INSERT 로 만들어진 row 도 finally 에서 반드시 제거되도록.
    insertedIds.add(newId);
    await sql`
      INSERT INTO users (id, name, email, image, role, oauth_provider, oauth_provider_account_id)
      VALUES (${newId}, ${name || "테스트 사용자"}, ${email}, ${image || null}, 'PENDING', ${provider}, ${providerAccountId})
    `;
    return { decision, effect: `insert:${newId}`, boundUser, emailUser };
  }

  // allow-existing: boundUser 를 기준으로 프로필만 최신화 (name/image), binding 은 갱신하지 않음.
  const updates = {};
  if (name && boundUser && boundUser.name !== name) updates.name = name;
  if (image && boundUser && boundUser.image !== image) updates.image = image;

  if (Object.keys(updates).length > 0) {
    if (updates.name && updates.image) {
      await sql`UPDATE users SET name = ${updates.name}, image = ${updates.image} WHERE id = ${decision.userId}`;
    } else if (updates.name) {
      await sql`UPDATE users SET name = ${updates.name} WHERE id = ${decision.userId}`;
    } else if (updates.image) {
      await sql`UPDATE users SET image = ${updates.image} WHERE id = ${decision.userId}`;
    }
  }

  return { decision, effect: `update-profile:${decision.userId}:${Object.keys(updates).join(",") || "no-op"}`, boundUser, emailUser };
}

// ---------------------------------------------------------------------------
// Fixture 헬퍼
// ---------------------------------------------------------------------------
async function insertFixture({
  email,
  name = "Fixture User",
  role = "PENDING",
  passwordHash = null,
  oauthProvider = null,
  oauthProviderAccountId = null,
}) {
  const id = crypto.randomUUID();
  // cleanup 추적: 이 fixture row 도 finally 에서 반드시 제거되도록.
  insertedIds.add(id);
  await sql`
    INSERT INTO users (id, name, email, role, password_hash, oauth_provider, oauth_provider_account_id)
    VALUES (${id}, ${name}, ${email}, ${role}, ${passwordHash}, ${oauthProvider}, ${oauthProviderAccountId})
  `;
  return id;
}

async function fetchUser(id) {
  const rows = await sql`
    SELECT id, name, email, role, oauth_provider, oauth_provider_account_id, image
    FROM users WHERE id = ${id}
  `;
  return rows[0] || null;
}

// ---------------------------------------------------------------------------
// Assertion 헬퍼
// ---------------------------------------------------------------------------
const results = [];
function assert(name, condition, actual, expected) {
  const pass = Boolean(condition);
  results.push({ name, pass, actual, expected });
  const badge = pass ? "✅ PASS" : "❌ FAIL";
  console.log(`  ${badge}  ${name}`);
  if (!pass) {
    console.log(`         expected: ${JSON.stringify(expected)}`);
    console.log(`         actual  : ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// 시나리오 실행
// ---------------------------------------------------------------------------
async function scenarioLegacyUnbound() {
  console.log("\n🔒 시나리오 1: legacy null/null 계정 → 공격자 Kakao 로그인 시도 (원 BLOCK 재현)");
  const victimEmail = emailFor("victim-legacy");
  const victimId = await insertFixture({
    email: victimEmail,
    name: "피해자 (legacy Google ADMIN)",
    role: "ADMIN",
    passwordHash: null,
    oauthProvider: null,
    oauthProviderAccountId: null,
  });

  const before = await fetchUser(victimId);
  const result = await simulateSignIn({
    provider: "kakao",
    providerAccountId: "attacker-kakao-account-1",
    providedEmail: victimEmail,
    name: "공격자",
  });
  const after = await fetchUser(victimId);

  assert(
    "결정이 block(legacy-unbound) 이다",
    result.decision.kind === "block" && result.decision.reason === "legacy-unbound",
    result.decision,
    { kind: "block", reason: "legacy-unbound" },
  );
  assert(
    "리다이렉트 URL 은 OAuthAccountNotLinked 이다",
    result.effect === "redirect:/login?error=OAuthAccountNotLinked",
    result.effect,
    "redirect:/login?error=OAuthAccountNotLinked",
  );
  assert(
    "피해자 role 은 ADMIN 그대로 (인수 실패)",
    after.role === "ADMIN",
    after.role,
    "ADMIN",
  );
  assert(
    "피해자 binding 은 여전히 null/null (backfill 발생 안 함)",
    after.oauth_provider === null && after.oauth_provider_account_id === null,
    { oauth_provider: after.oauth_provider, oauth_provider_account_id: after.oauth_provider_account_id },
    { oauth_provider: null, oauth_provider_account_id: null },
  );
  assert(
    "피해자 name 도 그대로 (프로필 오염 없음)",
    after.name === before.name,
    { before: before.name, after: after.name },
    "same as before",
  );
}

async function scenarioProviderMismatchBound() {
  console.log("\n🔒 시나리오 2: bound Google 계정 → 공격자 Kakao 로그인 시도");
  const victimEmail = emailFor("victim-bound");
  const victimId = await insertFixture({
    email: victimEmail,
    name: "피해자 (bound Google MEMBER)",
    role: "MEMBER",
    passwordHash: null,
    oauthProvider: "google",
    oauthProviderAccountId: "victim-google-real",
  });

  const before = await fetchUser(victimId);
  const result = await simulateSignIn({
    provider: "kakao",
    providerAccountId: "attacker-kakao-account-2",
    providedEmail: victimEmail,
    name: "공격자",
  });
  const after = await fetchUser(victimId);

  assert(
    "결정이 block(provider-mismatch) 이다",
    result.decision.kind === "block" && result.decision.reason === "provider-mismatch",
    result.decision,
    { kind: "block", reason: "provider-mismatch" },
  );
  assert(
    "피해자 binding 은 여전히 google/victim-google-real (덮어쓰기 안 됨)",
    after.oauth_provider === "google" && after.oauth_provider_account_id === "victim-google-real",
    { oauth_provider: after.oauth_provider, oauth_provider_account_id: after.oauth_provider_account_id },
    { oauth_provider: "google", oauth_provider_account_id: "victim-google-real" },
  );
  assert(
    "피해자 name 도 그대로",
    after.name === before.name,
    { before: before.name, after: after.name },
    "same as before",
  );
}

async function scenarioLocalAccount() {
  console.log("\n🔒 시나리오 3: 로컬 자격 (passwordHash) 계정 → OAuth 로그인 시도");
  const victimEmail = emailFor("victim-local");
  const victimId = await insertFixture({
    email: victimEmail,
    name: "피해자 (로컬 자격 ADMIN)",
    role: "ADMIN",
    passwordHash: "$2b$12$fakebcrypthashfakebcrypthashfakebcrypth",
    oauthProvider: null,
    oauthProviderAccountId: null,
  });

  const result = await simulateSignIn({
    provider: "google",
    providerAccountId: "attacker-google-account-3",
    providedEmail: victimEmail,
    name: "공격자",
  });
  const after = await fetchUser(victimId);

  assert(
    "결정이 block(local-account) 이다",
    result.decision.kind === "block" && result.decision.reason === "local-account",
    result.decision,
    { kind: "block", reason: "local-account" },
  );
  assert(
    "피해자 role 은 ADMIN 그대로",
    after.role === "ADMIN",
    after.role,
    "ADMIN",
  );
  assert(
    "피해자 binding 은 여전히 null/null",
    after.oauth_provider === null && after.oauth_provider_account_id === null,
    { oauth_provider: after.oauth_provider, oauth_provider_account_id: after.oauth_provider_account_id },
    { oauth_provider: null, oauth_provider_account_id: null },
  );
}

async function scenarioAllowNew() {
  console.log("\n✅ 시나리오 4: 신규 email → OAuth 신규 계정 생성");
  const newEmail = emailFor("new-user");
  const result = await simulateSignIn({
    provider: "google",
    providerAccountId: "new-google-account-4",
    providedEmail: newEmail,
    name: "신규 사용자",
  });

  assert(
    "결정이 allow-new 이다",
    result.decision.kind === "allow-new",
    result.decision,
    { kind: "allow-new" },
  );

  // INSERT 결과 조회
  const rows = await sql`
    SELECT id, name, role, oauth_provider, oauth_provider_account_id
    FROM users WHERE email = ${newEmail}
  `;
  assert(
    "새 row 가 정확히 1개 생성됨",
    rows.length === 1,
    rows.length,
    1,
  );
  assert(
    "새 row 의 role 은 PENDING (승격 없음)",
    rows[0]?.role === "PENDING",
    rows[0]?.role,
    "PENDING",
  );
  assert(
    "새 row 의 binding 은 google/new-google-account-4 로 즉시 채워짐",
    rows[0]?.oauth_provider === "google" && rows[0]?.oauth_provider_account_id === "new-google-account-4",
    { oauth_provider: rows[0]?.oauth_provider, oauth_provider_account_id: rows[0]?.oauth_provider_account_id },
    { oauth_provider: "google", oauth_provider_account_id: "new-google-account-4" },
  );
}

async function scenarioAllowExisting() {
  console.log("\n✅ 시나리오 5: 이미 bound 된 계정 재로그인 (프로필만 최신화)");
  const email = emailFor("re-login");
  const userId = await insertFixture({
    email,
    name: "예전 이름",
    role: "MEMBER",
    oauthProvider: "google",
    oauthProviderAccountId: "google-existing-5",
  });

  const before = await fetchUser(userId);
  const result = await simulateSignIn({
    provider: "google",
    providerAccountId: "google-existing-5",
    providedEmail: email,
    name: "새 이름",
  });
  const after = await fetchUser(userId);

  assert(
    "결정이 allow-existing 이다",
    result.decision.kind === "allow-existing",
    result.decision,
    { kind: "allow-existing" },
  );
  assert(
    "userId 는 boundUser.id 이다",
    result.decision.kind === "allow-existing" && result.decision.userId === userId,
    result.decision,
    { userId },
  );
  assert(
    "role 은 MEMBER 그대로 (승격/강등 없음)",
    after.role === "MEMBER",
    after.role,
    "MEMBER",
  );
  assert(
    "name 은 새 이름으로 최신화됨",
    after.name === "새 이름",
    after.name,
    "새 이름",
  );
  assert(
    "binding 튜플은 절대 갱신되지 않음",
    after.oauth_provider === before.oauth_provider &&
      after.oauth_provider_account_id === before.oauth_provider_account_id,
    { before, after },
    "binding unchanged",
  );
}

async function scenarioProviderMismatchDifferentAccountId() {
  console.log("\n🔒 시나리오 6: 같은 provider (google) 다른 accountId → block(provider-mismatch)");
  const victimEmail = emailFor("victim-diff-google");
  const victimId = await insertFixture({
    email: victimEmail,
    name: "피해자 (bound google account A)",
    role: "MEMBER",
    oauthProvider: "google",
    oauthProviderAccountId: "victim-google-A",
  });

  const before = await fetchUser(victimId);
  const result = await simulateSignIn({
    provider: "google",
    providerAccountId: "attacker-google-B",
    providedEmail: victimEmail,
    name: "공격자",
  });
  const after = await fetchUser(victimId);

  assert(
    "결정이 block(provider-mismatch) 이다",
    result.decision.kind === "block" && result.decision.reason === "provider-mismatch",
    result.decision,
    { kind: "block", reason: "provider-mismatch" },
  );
  assert(
    "피해자 binding accountId 는 A 그대로 (B 로 덮어쓰기 안 됨)",
    after.oauth_provider_account_id === "victim-google-A",
    after.oauth_provider_account_id,
    "victim-google-A",
  );
  assert(
    "피해자 role 그대로",
    after.role === before.role,
    { before: before.role, after: after.role },
    "same as before",
  );
}

async function scenarioKakaoPlaceholderEmail() {
  console.log("\n✅ 시나리오 7: Kakao (email claim 없음) 신규 로그인 → placeholder email 로 allow-new");
  // 카카오는 비즈앱 심사 없이는 email 을 제공하지 않아 placeholder email 이 사용된다.
  // 이 경로도 정상 신규 가입으로 처리되어야 한다.
  const kakaoAccountId = `kakao-new-${crypto.randomUUID().slice(0, 8)}`;
  const result = await simulateSignIn({
    provider: "kakao",
    providerAccountId: kakaoAccountId,
    providedEmail: null,
    name: "카카오 신규",
  });

  assert(
    "결정이 allow-new 이다",
    result.decision.kind === "allow-new",
    result.decision,
    { kind: "allow-new" },
  );

  const placeholderEmail = `kakao_${kakaoAccountId}@oauth.placeholder`;
  const rows = await sql`
    SELECT id, oauth_provider, oauth_provider_account_id, role FROM users WHERE email = ${placeholderEmail}
  `;
  assert(
    "placeholder email 로 row 가 정확히 1개 생성됨",
    rows.length === 1,
    rows.length,
    1,
  );
  assert(
    "role 은 PENDING",
    rows[0]?.role === "PENDING",
    rows[0]?.role,
    "PENDING",
  );

  // cleanup 은 insertedIds Set 기반으로 finally 에서 일괄 처리되므로 여기서 inline
  // DELETE 를 하지 않는다 (예외 발생 시에도 orphan row 가 남지 않도록).
}

async function scenarioBoundUserWinsOverEmailConflict() {
  console.log(
    "\n✅ 시나리오 8: boundUser 존재 + emailUser 는 다른 계정과 충돌 → boundUser 승 (이중 SELECT 우선순위 검증)",
  );
  // 배경: signIn 콜백은 SELECT boundUser (provider+accountId) 와 SELECT emailUser (email)
  //   두 조회를 병렬로 수행하고, decideOAuthSignIn 은 boundUser 가 있으면 무조건 그것을 우선한다.
  //   실제 DB IO 경계에서도 이 우선순위가 유지되는지 검증한다.
  //
  // 시나리오: Google 사용자 A 가 자신의 Google 계정 email 을 나중에 B 의 email 로 바꿔서
  //   로그인 시도. DB 상에는 이미 email B 를 가진 별도 계정 B (unbound) 가 존재.
  //   → boundUser SELECT 는 A 를 반환, emailUser SELECT 는 B 를 반환하는 상황.
  //   결과: 반드시 A 로 로그인되어야 하며 (B 로 인수 금지), B 의 어떤 필드도 변경되면 안 된다.
  const emailA = emailFor("bound-user-a");
  const emailB = emailFor("email-conflict-b");
  const idA = await insertFixture({
    email: emailA,
    name: "사용자 A (bound Google MEMBER)",
    role: "MEMBER",
    oauthProvider: "google",
    oauthProviderAccountId: "google-account-A-scenario-8",
  });
  const idB = await insertFixture({
    email: emailB,
    name: "사용자 B (unbound PENDING)",
    role: "PENDING",
    oauthProvider: null,
    oauthProviderAccountId: null,
  });

  const beforeA = await fetchUser(idA);
  const beforeB = await fetchUser(idB);
  const result = await simulateSignIn({
    provider: "google",
    providerAccountId: "google-account-A-scenario-8",
    providedEmail: emailB, // A 가 email 을 B 의 것으로 바꾼 상황을 재현
    name: "사용자 A 의 갱신된 이름",
  });
  const afterA = await fetchUser(idA);
  const afterB = await fetchUser(idB);

  assert(
    "결정이 allow-existing 이다",
    result.decision.kind === "allow-existing",
    result.decision,
    { kind: "allow-existing" },
  );
  assert(
    "userId 는 A.id 다 (B 로 인수되지 않음)",
    result.decision.kind === "allow-existing" && result.decision.userId === idA,
    { userId: result.decision.userId, expectedId: idA },
    { userId: idA },
  );
  assert(
    "A 의 name 은 최신화됨 (allow-existing 프로필 업데이트)",
    afterA.name === "사용자 A 의 갱신된 이름",
    afterA.name,
    "사용자 A 의 갱신된 이름",
  );
  assert(
    "A 의 binding 은 그대로 유지 (google/google-account-A-scenario-8)",
    afterA.oauth_provider === "google" &&
      afterA.oauth_provider_account_id === "google-account-A-scenario-8",
    {
      oauth_provider: afterA.oauth_provider,
      oauth_provider_account_id: afterA.oauth_provider_account_id,
    },
    {
      oauth_provider: "google",
      oauth_provider_account_id: "google-account-A-scenario-8",
    },
  );
  assert(
    "B 의 name 은 절대 변경되지 않음",
    afterB.name === beforeB.name,
    { before: beforeB.name, after: afterB.name },
    "same as before",
  );
  assert(
    "B 의 binding 은 절대 변경되지 않음 (null/null 그대로)",
    afterB.oauth_provider === null && afterB.oauth_provider_account_id === null,
    {
      oauth_provider: afterB.oauth_provider,
      oauth_provider_account_id: afterB.oauth_provider_account_id,
    },
    { oauth_provider: null, oauth_provider_account_id: null },
  );
  assert(
    "B 의 role 은 절대 변경되지 않음",
    afterB.role === beforeB.role,
    { before: beforeB.role, after: afterB.role },
    "same as before",
  );
}

// ---------------------------------------------------------------------------
// Cleanup — 이중 안전장치 (ID 우선 + nonce LIKE fallback)
//
// 삭제 우선순위:
//   1) insertedIds Set 에 추적된 모든 fixture id 를 삭제 (ID 기반, 가장 확실).
//      → scenario 7 처럼 nonce prefix 를 갖지 않는 placeholder email row 도 커버.
//   2) 안전망: nonce prefix email LIKE 로 한 번 더 DELETE (혹시 추적 누락된 row 가 있어도 정리).
//
// 각 단계는 독립 try/catch 로 감싸 한쪽이 실패해도 다른 쪽은 계속 시도한다.
// 최종 실패 시 stderr 에 수동 정리용 SQL 을 출력해 운영자가 직접 정리할 수 있게 한다.
// ---------------------------------------------------------------------------
async function cleanup() {
  const idList = [...insertedIds];
  let idsDeleted = 0;
  let nonceDeleted = 0;
  let idError = null;
  let nonceError = null;

  // 1단계: 추적된 ID 기반 삭제
  if (idList.length > 0) {
    try {
      const deletedRows = await sql`
        DELETE FROM users WHERE id = ANY(${idList}::uuid[]) RETURNING id
      `;
      idsDeleted = deletedRows.length;
    } catch (err) {
      idError = err;
    }
  }

  // 2단계: nonce LIKE 안전망 (1단계에서 놓친 것 정리)
  try {
    const deletedRows = await sql`
      DELETE FROM users WHERE email LIKE ${NONCE + "%"} RETURNING id
    `;
    nonceDeleted = deletedRows.length;
  } catch (err) {
    nonceError = err;
  }

  console.log(
    `\n🧹 Cleanup: ID 기반 ${idsDeleted}개 + nonce fallback ${nonceDeleted}개 삭제 완료.`,
  );

  // 실패 시 수동 정리용 SQL 을 stderr 로 출력
  if (idError || nonceError) {
    console.error(
      "\n⚠️ Cleanup 중 일부 오류가 발생했습니다. 수동 정리가 필요할 수 있습니다:",
    );
    if (idError) console.error("  ID 삭제 오류:", idError.message);
    if (nonceError) console.error("  nonce 삭제 오류:", nonceError.message);
    console.error("\n수동 정리 SQL:");
    if (idList.length > 0) {
      console.error(
        `  DELETE FROM users WHERE id IN (${idList.map(id => `'${id}'`).join(", ")});`,
      );
    }
    console.error(`  DELETE FROM users WHERE email LIKE '${NONCE}%';`);
  }
}

async function main() {
  console.log(`🔬 OAuth binding 보안 회귀 검증 시작 (nonce=${NONCE})`);
  console.log("   프로덕션 DB 를 사용합니다. 모든 fixture 는 .invalid TLD 로 격리됩니다.\n");

  try {
    await scenarioLegacyUnbound();
    await scenarioProviderMismatchBound();
    await scenarioLocalAccount();
    await scenarioAllowNew();
    await scenarioAllowExisting();
    await scenarioProviderMismatchDifferentAccountId();
    await scenarioKakaoPlaceholderEmail();
    await scenarioBoundUserWinsOverEmailConflict();
  } catch (err) {
    console.error("\n💥 시나리오 실행 중 예외 발생:", err);
    process.exitCode = 1;
  } finally {
    await cleanup();
  }

  console.log("\n" + "=".repeat(60));
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  console.log(`   결과: ${passed} PASS / ${failed} FAIL (총 ${results.length})`);
  console.log("=".repeat(60));

  if (failed > 0) {
    console.error("\n❌ 회귀가 감지되었습니다.");
    process.exit(1);
  } else {
    console.log("\n✅ 모든 시나리오가 예상대로 동작합니다.");
  }
}

main();
