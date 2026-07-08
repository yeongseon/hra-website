/**
 * OAuth signIn 결정 트리 미러 모듈 (#67, #82)
 *
 * 이 모듈의 유일한 존재 이유는 `scripts/verify-oauth-binding-security.mjs` 가
 * 프로덕션 DB 상태에 대해 실제 코드 (src/lib/auth-session.ts::decideOAuthSignIn)
 * 와 동일한 결정을 재현할 수 있게 하기 위함이다.
 *
 * 왜 미러가 필요한가?
 *   verify 스크립트는 순수 Node ESM (.mjs) 로 실행되므로 TypeScript 소스
 *   (src/lib/auth-session.ts) 를 그대로 import 할 수 없다. tsx 러너를 추가하는
 *   것도 방법이지만, verify 스크립트는 개발/운영자가 최소 의존성으로 실행하는
 *   운영 툴이므로 Node 표준 실행 경로를 유지한다.
 *
 * Drift 방지:
 *   이 미러가 원본과 어긋나면 verify 스크립트의 결과 신뢰도가 무너진다.
 *   이를 방지하기 위해 `tests/unit/auth-decision-mirror-parity.test.ts` 가
 *   5-way 결정 트리 전체와 hasLocalCredentials 판정을 원본과 이 미러 양쪽에
 *   동일 입력으로 흘려서 결과 equality 를 강제한다. 원본 로직을 수정하면
 *   parity 테스트가 실패하여 CI 가 이 미러의 수정을 강제한다.
 *
 * Field naming:
 *   원본 decideOAuthSignIn 은 Drizzle ORM 이 반환하는 camelCase 필드
 *   (oauthProvider, oauthProviderAccountId, passwordHash) 를 입력으로 받는다.
 *   verify 스크립트는 Neon serverless 의 raw SELECT 결과 (snake_case) 를
 *   사용하므로, 스크립트에서 camelCase 로 정규화한 뒤 이 미러를 호출한다.
 *   이렇게 하면 parity 테스트가 동일 shape 의 fixture 로 두 함수를 비교할 수
 *   있다.
 */

/**
 * 로컬(이메일/비밀번호) 자격이 존재하는지 판정 (#67).
 *
 * 원본: src/lib/auth-session.ts::hasLocalCredentials
 * 정의: passwordHash 가 non-empty 문자열이면 true. 그 외 (null / undefined /
 *   빈 문자열 / 필드 부재) 는 모두 false.
 */
export function hasLocalCredentials(existingUser) {
  const hash = existingUser?.passwordHash;
  return typeof hash === "string" && hash.length > 0;
}

/**
 * OAuth signIn 결정 트리 (#67).
 *
 * 원본: src/lib/auth-session.ts::decideOAuthSignIn
 * 결정 순서 (원본과 반드시 동일해야 함):
 *   1) boundUser 존재 → { kind: "allow-existing", userId }
 *   2) emailUser 없음 → { kind: "allow-new" }
 *   3) emailUser 가 로컬 자격 보유 → { kind: "block", reason: "local-account" }
 *   4) emailUser 의 oauthProvider === null && oauthProviderAccountId === null
 *        → { kind: "block", reason: "legacy-unbound" }
 *   5) 그 외 (다른 binding 이 이미 채워짐)
 *        → { kind: "block", reason: "provider-mismatch" }
 *
 * NULL 시맨틱 주의:
 *   4) 는 strict === null 로만 검사한다. undefined 는 legacy-unbound 로 잡지
 *   않고 provider-mismatch 로 흘려보낸다. 이는 원본과 동일한 방어적 선택이며
 *   parity 테스트로 고정한다.
 */
export function pureDecide(input) {
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
    return { kind: "block", reason: "legacy-unbound" };
  }

  return { kind: "block", reason: "provider-mismatch" };
}
