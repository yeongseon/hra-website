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
