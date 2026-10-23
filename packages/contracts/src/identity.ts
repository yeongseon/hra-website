/**
 * Web·모바일 계약에서 공유하는 사용자 역할과 표시 가능한 이메일 판정입니다.
 * 세션, DB, OAuth 제공자 SDK를 불러오지 않는 순수 코드만 둡니다.
 */

/** 사용자 역할의 wire 값과 TypeScript 타입을 같은 목록에서 정의합니다. */
export const USER_ROLES = ["ADMIN", "FACULTY", "MEMBER", "PENDING"] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** 내부 OAuth 대체 주소는 연락 가능한 실제 이메일로 표시하지 않습니다. */
export function isOAuthPlaceholderEmail(email: string): boolean {
  return email.toLowerCase().endsWith("@oauth.placeholder");
}

/** 비어 있거나 내부 대체 주소인 이메일을 공개 응답에서 null로 정규화합니다. */
export function getDisplayEmail(email: string | null | undefined): string | null {
  if (!email || isOAuthPlaceholderEmail(email)) {
    return null;
  }

  return email;
}
