/**
 * NextAuth 세션 판단 pure helpers (#68, #74, #75)
 *
 * 이 모듈은 side-effect 없이 순수 함수만 export 한다.
 * auth.ts 는 NextAuth() 를 최상단에서 실행하므로 vitest 에서 import 하면
 * next-auth 내부의 next/server 참조가 module resolution 을 깨뜨린다.
 * pure helper 를 여기로 분리해 두면 다음이 모두 가능해진다.
 *   1) db mock 없이 세션 무효화 규칙만 좁게 회귀 테스트 (auth-jwt-session.test.ts)
 *   2) auth.ts 는 얇은 wiring 파일로 유지 (핵심 로직은 여기)
 *   3) session/authorized 콜백에서 사용하는 UserRole/UUID guard 를 한 곳에서 관리
 */

import type { JWT } from "next-auth/jwt";

/**
 * 사용자 role 값의 런타임 검증용 상수 & type guard (#75)
 *
 * 배경: session 콜백에서 `token.role as UserRole` 타입 단언을 사용했다.
 *   next-auth.d.ts 의 JWT augmentation 으로 token.role 은 컴파일 타임에는 UserRole 이지만,
 *   런타임에서 token 이 오래된 세션(스키마 마이그레이션 이전)이거나 외부 요인으로 role 이
 *   비어있거나 잘못된 값일 수 있다. 이때 `as` 단언은 위험을 감춘다.
 *
 * 해결: 상수 배열 기반 type guard 로 검증 후 fallback (PENDING) 을 명시하여 defense-in-depth.
 *   schema.ts 의 userRoleEnum 정의와 값이 항상 일치해야 한다.
 */
export const USER_ROLES = ["ADMIN", "FACULTY", "MEMBER", "PENDING"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return (
    typeof value === "string" &&
    (USER_ROLES as readonly string[]).includes(value)
  );
}

/**
 * UUID 형식 검증용 정규식 (#75)
 *
 * users.id 는 Postgres UUID 컬럼이므로, session.user.id 로 흘러가는 값도 UUID 형식이어야 한다.
 * 단순히 "빈 문자열이 아님" 만 검사하면 "not-a-uuid" 같은 값이 INSERT/SELECT 에 도달해
 * invalid_input_syntax 오류를 유발할 수 있다.
 *
 * 표준 8-4-4-4-12 헥사 형식만 허용 (v1~v5 모두 커버). 정규식 매칭 비용은 세션당 1회, 무시 가능.
 */
export const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/**
 * jwt 콜백에서 DB lookup 시 사용할 조회 조건 (#68, #74)
 *
 * 우선순위: 유효한 UUID id → email fallback.
 *   - id 우선은 사용자가 이메일을 변경한 뒤에도 같은 세션을 유지하도록 하기 위함.
 *   - 둘 다 없으면 (bootstrap 실패 등) null 을 반환하여 jwt 콜백이 세션을 무효화하도록 위임.
 *
 * pure function 이므로 테스트로 각 우선순위 분기와 fallback 을 검증할 수 있다.
 */
export type JwtLookupCriteria =
  | { by: "id"; value: string }
  | { by: "email"; value: string };

export function pickJwtLookupCriteria(token: JWT): JwtLookupCriteria | null {
  if (isValidUuid(token.id)) {
    return { by: "id", value: token.id };
  }
  if (typeof token.email === "string" && token.email.length > 0) {
    return { by: "email", value: token.email };
  }
  return null;
}

/**
 * jwt 콜백에서 DB lookup 결과에 심을 최소 사용자 정보 (#68, #74)
 *
 * findFirst 의 `columns` 옵션과 shape 가 일치해야 하며, passwordHash/image 등
 * 세션 판단에 불필요한 필드는 의도적으로 제외한다.
 */
export type SessionUser = {
  id: string;
  role: UserRole;
  name: string | null;
  sessionVersion: number;
};

/**
 * jwt 콜백에서 세션 무효화 여부를 판단하는 pure helper (#68)
 *
 * 다음 두 규칙을 강제한다.
 *   1) DB 에서 사용자를 찾지 못하면 (계정 삭제 등) `null` 반환 → next-auth 가 쿠키를 청소하고
 *      세션을 종료한다.
 *   2) token 의 sessionVersion 이 DB 값과 다르면 revoke 된 세션이므로 `null` 반환.
 *      최초 발급 시(token.sessionVersion === undefined)에는 통과시켜 첫 세션에 값을 심는다.
 *
 * 유효한 경우 token 의 id/role/name/sessionVersion 을 DB 값으로 덮어써 stale 을 방지한다.
 *
 * pure function 이므로 db mock 없이 세션 무효화 로직을 회귀 테스트할 수 있다.
 */
export function resolveJwtSession(
  token: JWT,
  dbUser: SessionUser | null | undefined,
): JWT | null {
  if (!dbUser) {
    return null;
  }
  if (
    token.sessionVersion !== undefined &&
    token.sessionVersion !== dbUser.sessionVersion
  ) {
    return null;
  }
  token.id = dbUser.id;
  token.role = dbUser.role;
  token.name = dbUser.name;
  token.sessionVersion = dbUser.sessionVersion;
  return token;
}

/**
 * 로컬(이메일/비밀번호) 자격이 존재하는지 판정하는 pure helper (#67).
 *
 * 정의: passwordHash 가 non-empty 문자열이면 true. 그 외는 false.
 *   - null / undefined / 필드 부재 / 빈 문자열은 모두 false (소셜 전용 사용자).
 *   - bcrypt 해시가 심겨 있으면 true (로컬 자격 존재).
 *
 * 사용처: `decideOAuthSignIn` 결정 트리에서 "email 매칭된 사용자가 로컬 계정인지" 를
 *   판정하는 한 단계. 로컬 계정이면 OAuth 자동 연결이 무조건 차단되어야 한다.
 *   Google 의 `email_verified` 나 Kakao 의 email 정책을 신뢰하지 않는 우리로서는
 *   provider 의 email 소유권을 근거로 로컬 계정을 인계할 수 없다.
 */
export function hasLocalCredentials(
  existingUser: { passwordHash?: string | null } | null | undefined,
): boolean {
  const hash = existingUser?.passwordHash;
  return typeof hash === "string" && hash.length > 0;
}

/**
 * OAuth signIn 판정 결정 트리 pure helper (#67).
 *
 * 목적: signIn 콜백이 email 일치만으로 기존 사용자를 재인증하면 cross-provider
 *   account takeover 가 발생한다. 공격자가 피해자와 같은 email 의 다른 provider
 *   계정 (예: Kakao) 을 만들거나 매각된 Google account 로 로그인하면, 우리는
 *   provider 의 email 소유권을 검증할 방법이 없어 피해자의 role (예: ADMIN)
 *   세션을 그대로 인계해 준다.
 *
 * 해결 전략: users 테이블에 (oauth_provider, oauth_provider_account_id) 튜플을
 *   저장하고, signIn 은 이 튜플로 먼저 매칭한다. 신규 OAuth 가입은 처음부터
 *   튜플을 저장하며, 튜플이 비어 있는 계정 (마이그레이션 이전 소셜 가입자) 은
 *   자동 backfill 로 처리하지 않는다.
 *
 * 자동 backfill 을 하지 않는 이유: null/null 상태의 legacy 소셜 계정을 email
 *   매칭만으로 첫 재로그인 시 임의의 (provider, providerAccountId) 로 채워 주면,
 *   공격자가 피해자 email 로 새 소셜 계정을 만들어 legacy row 를 선점할 수 있다.
 *   이는 원 BLOCK 시나리오와 동일한 cross-provider takeover 를 재현하므로,
 *   legacy 계정은 fail-closed 로 차단하고, 관리자가 DB 를 직접 조작하거나 신뢰
 *   가능한 과거 provider 데이터 기반 오프라인 backfill 스크립트를 통해서만 재활성화한다
 *   (현재 이 저장소에는 관리자 UI 상의 수동 바인딩 액션은 없다).
 *
 * 판정 트리 (호출자는 이 결정에 따라 IO 를 수행한다):
 *   1) boundUser 존재 → allow-existing
 *      → (provider, providerAccountId) 로 매칭된 사용자가 있으면 해당 사용자로 로그인.
 *   2) boundUser 없음 & emailUser 없음 → allow-new
 *      → 신규 email 이므로 새 계정 (role=PENDING) 을 만든다. INSERT 시 튜플을 즉시 저장.
 *   3) boundUser 없음 & emailUser 로컬 자격 보유 → block(local-account)
 *      → 이메일/비밀번호로 가입한 계정을 OAuth 로 자동 인계하는 것을 금지.
 *   4) boundUser 없음 & emailUser 소셜 전용 & binding 미채움 → block(legacy-unbound)
 *      → 마이그레이션 이전에 소셜로 가입한 사용자. 자동 backfill 은 email 선점
 *        공격에 취약하므로 fail-closed. 관리자가 DB 나 신뢰 가능한 오프라인
 *        스크립트로 수동 바인딩해야 한다 (현재는 관리자 UI 액션 없음).
 *   5) boundUser 없음 & emailUser 소셜 전용 & 이미 binding 있음 → block(provider-mismatch)
 *      → 같은 email 이지만 다른 provider 나 다른 accountId 로 접근 시도. cross-provider
 *        account takeover 시나리오이므로 차단한다.
 *
 * NULL 시맨틱: Postgres 는 UNIQUE (NULL, NULL) 을 위반으로 보지 않으므로 legacy
 *   row 가 공존할 수는 있으나, 이 helper 는 legacy null/null 을 로그인 경로에서
 *   허용하지 않는다. 데이터 무결성은 schema.ts 의 CHECK 제약이 함께 보장한다
 *   (둘 다 null 이거나 둘 다 non-null).
 *
 * pure function 이므로 db mock 없이 결정 트리 전체를 회귀 테스트로 고정한다.
 * 실제 lookup/insert 는 signIn 콜백이 이 반환값을 보고 수행한다.
 */
export type OAuthSignInDecision =
  | { kind: "allow-existing"; userId: string }
  | { kind: "allow-new" }
  | {
      kind: "block";
      reason: "local-account" | "provider-mismatch" | "legacy-unbound";
    };

export function decideOAuthSignIn(input: {
  boundUser: { id: string } | null | undefined;
  emailUser:
    | {
        id: string;
        oauthProvider: string | null;
        oauthProviderAccountId: string | null;
        passwordHash?: string | null;
      }
    | null
    | undefined;
}): OAuthSignInDecision {
  if (input.boundUser) {
    return { kind: "allow-existing", userId: input.boundUser.id };
  }

  if (!input.emailUser) {
    return { kind: "allow-new" };
  }

  if (hasLocalCredentials(input.emailUser)) {
    return { kind: "block", reason: "local-account" };
  }

  if (
    input.emailUser.oauthProvider === null &&
    input.emailUser.oauthProviderAccountId === null
  ) {
    // legacy 소셜 계정 (마이그레이션 이전 가입자). 자동 backfill 은 email
    // 선점 공격을 재개하므로 fail-closed. 관리자가 DB/오프라인 스크립트로
    // 수동 바인딩해야 한다 (관리자 UI 액션 없음).
    return { kind: "block", reason: "legacy-unbound" };
  }

  return { kind: "block", reason: "provider-mismatch" };
}
