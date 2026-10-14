/**
 * 공동 자료 열람 정책 (#100).
 * 승인 회원은 기수와 무관하게 공동 자료를 열람하며, 승인 대기는 접근하지 못한다.
 */
export function canReadSharedResource(role: string | null | undefined): boolean {
  return role === "ADMIN" || role === "FACULTY" || role === "MEMBER";
}
