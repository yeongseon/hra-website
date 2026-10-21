/**
 * 익명 접근을 거부해야 하는 경로의 공통 회귀 목록입니다.
 * 기본 CI 스모크와 독립 인증 회귀가 같은 목록을 사용하므로 새 경로는 여기에 추가합니다.
 * 합성 슬러그를 사용하며 거부 응답 확인에 운영 DB·Blob·OAuth 연결은 필요하지 않습니다.
 */
export const anonymousProtectedPaths = [
  "/admin",
  "/admin/templates",
  "/admin/resources/templates",
  "/admin/users",
  "/resources",
  "/member/templates",
  "/member/templates/management-book",
  "/member/templates/management-book/print",
  "/member/guides/report-writing-guide",
  "/mypage",
] as const;
