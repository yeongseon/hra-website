/**
 * decideOAuthSignIn 미러 parity 테스트 (#67, #82)
 *
 * 목적:
 *   `scripts/verify-oauth-binding-security.mjs` 는 프로덕션 DB 를 대상으로 signIn
 *   콜백의 결정 트리를 재현해 회귀를 감지한다. 그러나 verify 스크립트는 순수
 *   Node ESM (.mjs) 이므로 TypeScript 원본을 import 할 수 없어, 결정 트리
 *   함수를 별도로 미러링한다 (scripts/_lib/mirror-decide.mjs).
 *
 *   미러가 원본과 어긋나면 verify 결과 신뢰도가 무너진다 (원본이 바뀌었는데
 *   verify 는 옛 결정 그대로 통과 → 회귀를 놓친다). 이를 방지하기 위해
 *   본 테스트가 5-way 결정 트리 전체와 hasLocalCredentials 판정을 원본과
 *   미러 양쪽에 동일 fixture 로 흘려 결과 equality 를 CI 에서 강제한다.
 *
 * 커버리지:
 *   - decideOAuthSignIn 의 5 가지 분기:
 *     1) boundUser 존재 → allow-existing (userId 포함)
 *     2) boundUser 없음 & emailUser 없음 → allow-new
 *     3) boundUser 없음 & emailUser 로컬 자격 보유 → block(local-account)
 *     4) boundUser 없음 & emailUser 소셜 & null/null binding → block(legacy-unbound)
 *     5) boundUser 없음 & emailUser 소셜 & 다른 binding → block(provider-mismatch)
 *   - NULL 시맨틱 edge case:
 *     · oauthProvider === null && oauthProviderAccountId === null 만 legacy-unbound
 *     · undefined 는 legacy 로 잡지 않고 provider-mismatch 로 흘림 (원본 strict === null 준수)
 *   - hasLocalCredentials 의 falsy 케이스 (null / undefined / 빈 문자열 / 필드 부재)
 *
 * 실패 시:
 *   원본 (src/lib/auth-session.ts) 또는 미러 (scripts/_lib/mirror-decide.mjs) 중
 *   한 쪽만 변경되면 이 테스트가 실패해 CI 가 반대편의 수정을 강제한다.
 *   두 곳을 함께 수정하고 이 테스트도 갱신하면 통과한다.
 */

import { describe, expect, it } from "vitest";
import {
  decideOAuthSignIn,
  hasLocalCredentials,
  type OAuthSignInDecision,
} from "@/lib/auth-session";
import {
  pureDecide as mirrorDecide,
  hasLocalCredentials as mirrorHasLocalCredentials,
} from "../../scripts/_lib/mirror-decide.mjs";

type DecideInput = Parameters<typeof decideOAuthSignIn>[0];
type LocalCredsInput = Parameters<typeof hasLocalCredentials>[0];

const mirror = mirrorDecide as (input: DecideInput) => OAuthSignInDecision;
const mirrorHas = mirrorHasLocalCredentials as (
  user: LocalCredsInput,
) => boolean;

const UUID_BOUND = "11111111-2222-3333-4444-555555555555";
const UUID_EMAIL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("decideOAuthSignIn parity (real vs mirror)", () => {
  const cases: Array<{
    name: string;
    input: DecideInput;
    expected: OAuthSignInDecision;
  }> = [
    {
      name: "1) boundUser 존재 → allow-existing (boundUser.id 반환)",
      input: {
        boundUser: { id: UUID_BOUND },
        emailUser: null,
      },
      expected: { kind: "allow-existing", userId: UUID_BOUND },
    },
    {
      name: "1a) boundUser 존재 & emailUser 도 존재 → 여전히 allow-existing (boundUser 우선)",
      input: {
        boundUser: { id: UUID_BOUND },
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: "kakao",
          oauthProviderAccountId: "other-account",
          passwordHash: "bcrypt-hash",
        },
      },
      expected: { kind: "allow-existing", userId: UUID_BOUND },
    },
    {
      name: "2) boundUser 없음 & emailUser 없음 → allow-new",
      input: { boundUser: null, emailUser: null },
      expected: { kind: "allow-new" },
    },
    {
      name: "2a) boundUser undefined & emailUser undefined → allow-new (null 과 동일 취급)",
      input: { boundUser: undefined, emailUser: undefined },
      expected: { kind: "allow-new" },
    },
    {
      name: "3) emailUser 가 로컬 자격 (passwordHash) 보유 → block(local-account)",
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: null,
          oauthProviderAccountId: null,
          passwordHash: "bcrypt-hash",
        },
      },
      expected: { kind: "block", reason: "local-account" },
    },
    {
      name: "3a) emailUser 가 로컬 자격 & 이미 다른 binding 도 있음 → 여전히 block(local-account) (local 이 우선)",
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: "google",
          oauthProviderAccountId: "google-123",
          passwordHash: "bcrypt-hash",
        },
      },
      expected: { kind: "block", reason: "local-account" },
    },
    {
      name: "4) 소셜 전용 & oauthProvider/oauthProviderAccountId 모두 null → block(legacy-unbound)",
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: null,
          oauthProviderAccountId: null,
          passwordHash: null,
        },
      },
      expected: { kind: "block", reason: "legacy-unbound" },
    },
    {
      name: "4a) 소셜 전용 & passwordHash 필드 부재 & null/null binding → block(legacy-unbound)",
      // passwordHash 필드 자체가 없어도 hasLocalCredentials 는 false 여야 하며,
      // 결정 트리는 legacy 분기로 진입해야 한다. 이는 신규 스키마 이전에 저장된
      // legacy 소셜 계정 (passwordHash 컬럼 없음) 을 재로그인 시도할 때 재현된다.
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: null,
          oauthProviderAccountId: null,
        },
      },
      expected: { kind: "block", reason: "legacy-unbound" },
    },
    {
      name: "4b) 소셜 전용 & passwordHash 빈 문자열 & null/null binding → block(legacy-unbound)",
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: null,
          oauthProviderAccountId: null,
          passwordHash: "",
        },
      },
      expected: { kind: "block", reason: "legacy-unbound" },
    },
    {
      name: "5) 소셜 전용 & 다른 binding (같은 email, 다른 provider) → block(provider-mismatch)",
      // cross-provider account takeover 원(原) 시나리오 (#67 의 핵심).
      // Google 로 가입한 피해자 계정에 공격자가 Kakao 로 같은 email 을 만들어 접근 시도.
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: "google",
          oauthProviderAccountId: "google-123",
          passwordHash: null,
        },
      },
      expected: { kind: "block", reason: "provider-mismatch" },
    },
    {
      name: "5a) 소셜 전용 & 같은 provider 지만 다른 accountId → block(provider-mismatch)",
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: "kakao",
          oauthProviderAccountId: "attacker-account-999",
          passwordHash: null,
        },
      },
      expected: { kind: "block", reason: "provider-mismatch" },
    },
    {
      name: "5b) NULL 시맨틱: oauthProvider 만 null, accountId 는 non-null → provider-mismatch (legacy 아님)",
      // 원본은 두 컬럼이 모두 === null 인 경우에만 legacy 로 잡는다. 한 쪽만 null 인
      // 비정상 상태는 legacy 처리하지 않고 provider-mismatch 로 흘려 fail-closed.
      // 이 semantic drift 를 미러가 그대로 유지하는지 검증하는 것이 이 케이스의 목적.
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: null,
          oauthProviderAccountId: "orphan-account-id",
          passwordHash: null,
        },
      },
      expected: { kind: "block", reason: "provider-mismatch" },
    },
    {
      name: "5c) NULL 시맨틱: accountId 만 null, provider 는 non-null → provider-mismatch (legacy 아님)",
      input: {
        boundUser: null,
        emailUser: {
          id: UUID_EMAIL,
          oauthProvider: "google",
          oauthProviderAccountId: null,
          passwordHash: null,
        },
      },
      expected: { kind: "block", reason: "provider-mismatch" },
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    const realDecision = decideOAuthSignIn(input);
    const mirrorDecision = mirror(input);

    expect(realDecision).toEqual(expected);
    expect(mirrorDecision).toEqual(expected);
    expect(mirrorDecision).toEqual(realDecision);
  });
});

describe("hasLocalCredentials parity (real vs mirror)", () => {
  const cases: Array<{
    name: string;
    input: LocalCredsInput;
    expected: boolean;
  }> = [
    {
      name: "non-empty passwordHash → true",
      input: { passwordHash: "bcrypt-hash-abc" },
      expected: true,
    },
    {
      name: "passwordHash null → false",
      input: { passwordHash: null },
      expected: false,
    },
    {
      name: "passwordHash undefined → false",
      input: { passwordHash: undefined },
      expected: false,
    },
    {
      name: "passwordHash 빈 문자열 → false",
      input: { passwordHash: "" },
      expected: false,
    },
    {
      name: "passwordHash 필드 부재 → false",
      input: {},
      expected: false,
    },
    {
      name: "existingUser null → false",
      input: null,
      expected: false,
    },
    {
      name: "existingUser undefined → false",
      input: undefined,
      expected: false,
    },
  ];

  it.each(cases)("$name", ({ input, expected }) => {
    const realResult = hasLocalCredentials(input);
    const mirrorResult = mirrorHas(input);

    expect(realResult).toBe(expected);
    expect(mirrorResult).toBe(expected);
    expect(mirrorResult).toBe(realResult);
  });
});
