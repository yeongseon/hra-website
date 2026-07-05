/**
 * auth-session pure helper 회귀 테스트 (#67, #68, #74)
 *
 * 검증 대상 (src/lib/auth-session.ts):
 *   - pickJwtLookupCriteria: DB 조회 우선순위 (UUID id → email fallback → null)
 *   - resolveJwtSession: 세션 무효화 판단
 *     · dbUser 없음 → null (계정 삭제 시나리오)
 *     · sessionVersion 불일치 → null (권한 변경 후 강제 로그아웃)
 *     · sessionVersion undefined (bootstrap) → 통과, DB 값을 심음
 *     · 정상 → id/role/name/sessionVersion 을 DB 값으로 덮어써 stale 방지
 *   - hasLocalCredentials: 로컬 자격 존재 판정 (#67)
 *     · passwordHash 가 존재하면 true → OAuth 자동 병합 차단 근거
 *     · null/undefined/빈 문자열/필드 부재 는 모두 false → 소셜 전용 사용자 통과
 *   - decideOAuthSignIn: OAuth signIn 결정 트리 (#67)
 *     · boundUser 존재 → allow-existing (provider+accountId 매칭이 최우선)
 *     · boundUser 없음 & emailUser 없음 → allow-new (신규 계정 생성)
 *     · boundUser 없음 & 로컬 자격 → block(local-account) (자동 병합 금지)
 *     · boundUser 없음 & 소셜 & binding 미채움 → block(legacy-unbound) (fail-closed)
 *     · boundUser 없음 & 소셜 & 이미 다른 binding → block(provider-mismatch) (인수 차단)
 *
 * 이 테스트는 db mock 없이 pure function 만 검증하므로 세션 무효화 및 계정 병합
 * 차단 규칙의 회귀만 좁게 검증한다. drizzle findFirst / redirect 통합 동작은
 * Playwright E2E 몫이다.
 *
 * import 경로 주의: auth.ts 는 NextAuth() 를 최상단에서 실행하므로 vitest 에서
 * import 하면 next-auth 내부의 next/server 참조가 module resolution 을 깨뜨린다.
 * 따라서 pure helper 는 auth-session.ts 에 상주하며 테스트도 그 모듈을 참조한다.
 */

import { describe, expect, it } from "vitest";
import type { JWT } from "next-auth/jwt";
import {
  decideOAuthSignIn,
  hasLocalCredentials,
  pickJwtLookupCriteria,
  resolveJwtSession,
  type SessionUser,
} from "@/lib/auth-session";

// Postgres UUID 컬럼 형식 (8-4-4-4-12) 을 만족하는 fixture.
const UUID_A = "a3f9b1c2-4d5e-4f6a-8b7c-9d0e1f2a3b4c";

describe("pickJwtLookupCriteria", () => {
  it("유효한 UUID id 가 있으면 id 기준 조회 조건을 반환한다", () => {
    const token = { id: UUID_A, email: "user@example.com" } as JWT;
    expect(pickJwtLookupCriteria(token)).toEqual({ by: "id", value: UUID_A });
  });

  it("id 가 없고 email 만 있으면 email 로 fallback 한다", () => {
    const token = { email: "user@example.com" } as JWT;
    expect(pickJwtLookupCriteria(token)).toEqual({
      by: "email",
      value: "user@example.com",
    });
  });

  it("id 가 UUID 형식이 아니면 email 로 fallback 한다 (조작 방어)", () => {
    // 프론트에서 개발자 툴로 조작한 토큰 등에 대비.
    const token = {
      id: "not-a-uuid",
      email: "user@example.com",
    } as unknown as JWT;
    expect(pickJwtLookupCriteria(token)).toEqual({
      by: "email",
      value: "user@example.com",
    });
  });

  it("id 도 없고 email 도 없으면 null 을 반환한다 (bootstrap 실패)", () => {
    const token = {} as JWT;
    expect(pickJwtLookupCriteria(token)).toBeNull();
  });

  it("email 이 빈 문자열이면 fallback 하지 않는다", () => {
    const token = { email: "" } as JWT;
    expect(pickJwtLookupCriteria(token)).toBeNull();
  });

  it("email 이 non-string 이면 fallback 하지 않는다 (런타임 방어)", () => {
    // JWT 타입 상 email 은 string | null | undefined 지만
    // 오래된 세션이나 조작된 토큰에 대비한 런타임 방어.
    const token = { email: 42 as unknown as string } as JWT;
    expect(pickJwtLookupCriteria(token)).toBeNull();
  });
});

describe("resolveJwtSession", () => {
  const dbUser: SessionUser = {
    id: UUID_A,
    role: "MEMBER",
    name: "홍길동",
    sessionVersion: 3,
  };

  it("dbUser 가 undefined 이면 null 을 반환한다 (계정 삭제 시나리오)", () => {
    const token = { id: UUID_A, sessionVersion: 3 } as JWT;
    expect(resolveJwtSession(token, undefined)).toBeNull();
  });

  it("dbUser 가 null 이어도 null 을 반환한다 (findFirst null 방어)", () => {
    const token = { id: UUID_A, sessionVersion: 3 } as JWT;
    expect(resolveJwtSession(token, null)).toBeNull();
  });

  it("token.sessionVersion 이 undefined 면 통과하고 DB 값을 심는다 (bootstrap)", () => {
    // 최초 발급 또는 마이그레이션 이전 세션.
    const token = { id: UUID_A, email: "user@example.com" } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result).not.toBeNull();
    expect(result?.sessionVersion).toBe(3);
    expect(result?.role).toBe("MEMBER");
    expect(result?.name).toBe("홍길동");
  });

  it("token.sessionVersion 이 DB 값과 같으면 통과하고 필드를 덮어쓴다", () => {
    const token = { id: UUID_A, sessionVersion: 3, role: "MEMBER" } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result).toBe(token);
    expect(result?.id).toBe(UUID_A);
    expect(result?.role).toBe("MEMBER");
    expect(result?.sessionVersion).toBe(3);
  });

  it("token.sessionVersion 이 DB 값보다 낮으면 null 을 반환한다 (revoke)", () => {
    // updateUserGroup 이 role/cohort 변경 시 sessionVersion 을 +1 하므로
    // 다른 디바이스의 오래된 토큰은 이 분기로 무효화된다.
    const token = { id: UUID_A, sessionVersion: 2 } as JWT;
    expect(resolveJwtSession(token, dbUser)).toBeNull();
  });

  it("token.sessionVersion 이 DB 값보다 높아도 null 을 반환한다 (엄격 equality)", () => {
    // 정상 흐름에서는 발생 불가하지만, 토큰 조작 방어를 위해 정확 일치를 강제한다.
    const token = { id: UUID_A, sessionVersion: 99 } as JWT;
    expect(resolveJwtSession(token, dbUser)).toBeNull();
  });

  it("email fallback 조회 후 dbUser.id 를 token.id 에 채운다", () => {
    // credentials 로그인 초기에는 token.id 가 없어 email 로 fallback 하고,
    // 이후 요청부터 id 우선 조회가 가능하도록 dbUser.id 를 심는다.
    const token = { email: "user@example.com" } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result?.id).toBe(UUID_A);
  });

  it("token 의 stale role 을 DB 값으로 덮어써 권한 상승 우회를 막는다", () => {
    // sessionVersion 이 우연히 같더라도 token 이 조작된 경우 role 은 반드시 DB 값이 승리한다.
    const token = {
      id: UUID_A,
      sessionVersion: 3,
      role: "ADMIN",
    } as JWT;
    const result = resolveJwtSession(token, dbUser);
    expect(result?.role).toBe("MEMBER");
  });

  it("dbUser.name 이 null 이어도 안전하게 심는다 (소셜 로그인 초기 상태)", () => {
    const anonymousUser: SessionUser = {
      id: UUID_A,
      role: "PENDING",
      name: null,
      sessionVersion: 0,
    };
    const token = { id: UUID_A } as JWT;
    const result = resolveJwtSession(token, anonymousUser);
    expect(result).not.toBeNull();
    expect(result?.name).toBeNull();
  });
});

describe("hasLocalCredentials", () => {
  it("existingUser 가 null 이면 false (신규 email → 신규 계정 흐름)", () => {
    expect(hasLocalCredentials(null)).toBe(false);
  });

  it("existingUser 가 undefined 이면 false (findFirst miss)", () => {
    expect(hasLocalCredentials(undefined)).toBe(false);
  });

  it("passwordHash 필드 자체가 없으면 false (소셜 전용 사용자)", () => {
    expect(hasLocalCredentials({})).toBe(false);
  });

  it("passwordHash 가 null 이면 false (DB nullable 컬럼)", () => {
    expect(hasLocalCredentials({ passwordHash: null })).toBe(false);
  });

  it("passwordHash 가 undefined 이면 false", () => {
    expect(hasLocalCredentials({ passwordHash: undefined })).toBe(false);
  });

  it("passwordHash 가 빈 문자열이면 false (방어적 처리)", () => {
    expect(hasLocalCredentials({ passwordHash: "" })).toBe(false);
  });

  it("bcrypt 해시가 있으면 true → OAuth 자동 병합 차단", () => {
    expect(
      hasLocalCredentials({
        passwordHash: "$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      }),
    ).toBe(true);
  });
});

describe("decideOAuthSignIn", () => {
  // 소셜 전용 사용자 (로컬 자격 없음) 를 표현하는 base fixture.
  // 각 케이스는 필요한 필드만 override 하여 결정 트리의 특정 분기를 발동시킨다.
  const socialUser = {
    id: "3f9a0b11-c1e2-4b8f-9a5c-1d2e3f4a5b6c",
    oauthProvider: "google",
    oauthProviderAccountId: "google-account-42",
    passwordHash: null,
  } as const;

  it("boundUser 가 있으면 emailUser 유무와 상관없이 allow-existing", () => {
    // (provider, accountId) 튜플 매칭이 최우선 재인증 신호.
    const decision = decideOAuthSignIn({
      boundUser: { id: socialUser.id },
      emailUser: null,
    });
    expect(decision).toEqual({ kind: "allow-existing", userId: socialUser.id });
  });

  it("boundUser 가 있으면 emailUser 가 로컬 자격을 갖고 있어도 allow-existing", () => {
    // 극단 케이스: 같은 email 을 쓰는 로컬 계정이 별도로 있어도, boundUser 매칭이 성공하면
    // 그 사용자로 로그인시켜야 한다 (bound 튜플이 신뢰의 원천).
    const decision = decideOAuthSignIn({
      boundUser: { id: socialUser.id },
      emailUser: {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        oauthProvider: null,
        oauthProviderAccountId: null,
        passwordHash: "$2b$12$existing-local-hash",
      },
    });
    expect(decision).toEqual({ kind: "allow-existing", userId: socialUser.id });
  });

  it("boundUser 도 emailUser 도 없으면 allow-new (신규 계정 생성)", () => {
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: null,
    });
    expect(decision).toEqual({ kind: "allow-new" });
  });

  it("emailUser 가 passwordHash 를 갖고 있으면 block(local-account)", () => {
    // #67 원 취약점: 이메일/비밀번호로 가입한 계정을 OAuth 로 자동 인계하는 것을 금지.
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        id: socialUser.id,
        oauthProvider: null,
        oauthProviderAccountId: null,
        passwordHash: "$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      },
    });
    expect(decision).toEqual({ kind: "block", reason: "local-account" });
  });

  it("passwordHash 가 있으면 oauth 필드가 부분/전체로 채워져 있어도 block(local-account) 우선", () => {
    // #67 Oracle NIT 회귀 방어: 로컬 자격 검사가 provider-mismatch 검사보다 먼저 실행되어야 한다.
    // 만약 passwordHash 있는 계정에 어떤 이유로든 oauth 필드가 부분/전체로 채워져도 (예: 과거
    // 실수로 남은 partial row, 또는 DB 수동 조작) 소셜 로그인은 반드시 local-account 로 차단해야
    // 하며, provider-mismatch 로 흡수되면 안 된다. 우선순위: local-account > (legacy-unbound|provider-mismatch).
    const partialBinding = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        id: socialUser.id,
        oauthProvider: "google",
        oauthProviderAccountId: null,
        passwordHash: "$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      },
    });
    expect(partialBinding).toEqual({ kind: "block", reason: "local-account" });

    const fullOtherBinding = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        id: socialUser.id,
        oauthProvider: "kakao",
        oauthProviderAccountId: "kakao-attacker",
        passwordHash: "$2b$12$abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG",
      },
    });
    expect(fullOtherBinding).toEqual({ kind: "block", reason: "local-account" });
  });

  it("emailUser 가 소셜 전용이고 binding 이 미채움이면 block(legacy-unbound)", () => {
    // #67 Oracle BLOCK 방어: 마이그레이션 이전 소셜 사용자 (binding null/null) 는 fail-closed.
    // 자동 backfill 을 허용하면 공격자가 피해자 email 로 새 소셜 계정을 만들어 legacy row 를
    // 임의 provider 로 채워 인수할 수 있다 (원 BLOCK 시나리오 재현). 관리자가 DB/오프라인 스크립트로만 수동 바인딩 가능.
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        id: socialUser.id,
        oauthProvider: null,
        oauthProviderAccountId: null,
        passwordHash: null,
      },
    });
    expect(decision).toEqual({ kind: "block", reason: "legacy-unbound" });
  });

  it("legacy null/null 계정에 다른 provider 로 접근해도 block(legacy-unbound) (email 선점 방어)", () => {
    // #67 Oracle 지적 회귀 방어: 피해자가 legacy Google 계정 (binding null/null) 을 갖고 있고
    // 공격자가 같은 email 로 Kakao 로그인 시도할 때, email 매칭만으로 legacy row 를 kakao 로
    // 채워 인수하지 못하도록 fail-closed. 이 케이스가 원 BLOCK 시나리오를 정확히 재현한다.
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        id: "victim-legacy-google-admin",
        oauthProvider: null,
        oauthProviderAccountId: null,
        passwordHash: null,
      },
    });
    expect(decision).toEqual({ kind: "block", reason: "legacy-unbound" });
  });

  it("legacy null/null 계정은 emailUser 의 role 과 무관하게 block(legacy-unbound)", () => {
    // #67 원 BLOCK 시나리오의 핵심: legacy ADMIN 이든 MEMBER 든 로그인 경로에서는
    // provider 소유권을 검증할 수 없으므로 무조건 차단. role 상승 자체를 봉쇄.
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        id: "legacy-admin-account",
        oauthProvider: null,
        oauthProviderAccountId: null,
        passwordHash: null,
      },
    });
    expect(decision.kind).toBe("block");
    if (decision.kind === "block") {
      expect(decision.reason).toBe("legacy-unbound");
    }
  });

  it("emailUser 가 소셜 전용이고 다른 provider 로 bind 되어 있으면 block(provider-mismatch)", () => {
    // #67 cross-provider takeover: 같은 email 의 Google 계정 → Kakao 로 접근하는 시나리오.
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        ...socialUser,
        oauthProvider: "kakao",
        oauthProviderAccountId: "kakao-account-99",
      },
    });
    expect(decision).toEqual({ kind: "block", reason: "provider-mismatch" });
  });

  it("emailUser 가 소셜 전용이고 같은 provider 지만 accountId 가 다르면 block(provider-mismatch)", () => {
    // provider 는 같지만 계정이 매각/재발급된 시나리오. accountId 불일치도 인수 시도이므로 차단.
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        ...socialUser,
        oauthProvider: "google",
        oauthProviderAccountId: "google-account-DIFFERENT",
      },
    });
    expect(decision).toEqual({ kind: "block", reason: "provider-mismatch" });
  });

  it("passwordHash 는 없지만 oauthProvider 만 채워져 있어도 block(provider-mismatch)", () => {
    // 부분적으로 채워진 row (accountId 만 null 인 비정상 상태) 도 안전하게 차단해야 한다.
    // 스키마의 CHECK 제약이 이런 부분 채움 row 를 근본적으로 막지만, pure helper 도 defense-in-depth
    // 로 legacy 흡수 대신 provider-mismatch 로 차단한다 (예상 못한 자동 병합 방지).
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        ...socialUser,
        oauthProvider: "google",
        oauthProviderAccountId: null,
      },
    });
    expect(decision).toEqual({ kind: "block", reason: "provider-mismatch" });
  });

  it("passwordHash 는 없지만 oauthProviderAccountId 만 채워져 있어도 block(provider-mismatch)", () => {
    // 위 케이스의 대칭. provider 만 null 인 비정상 row 도 legacy 로 흡수되지 않고 provider-mismatch 로 차단.
    const decision = decideOAuthSignIn({
      boundUser: null,
      emailUser: {
        ...socialUser,
        oauthProvider: null,
        oauthProviderAccountId: "google-account-42",
      },
    });
    expect(decision).toEqual({ kind: "block", reason: "provider-mismatch" });
  });

  it("undefined boundUser / undefined emailUser 는 각각 null 과 동일하게 처리한다", () => {
    // drizzle findFirst 는 miss 시 undefined 를 반환한다. null 과 undefined 모두 falsy 로 흡수해야 한다.
    const decision = decideOAuthSignIn({
      boundUser: undefined,
      emailUser: undefined,
    });
    expect(decision).toEqual({ kind: "allow-new" });
  });
});
