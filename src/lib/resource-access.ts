/**
 * 기존 자료실 인가 이름을 공통 회원 인가 헬퍼에 연결합니다 (#100, #123).
 * 자료실 페이지는 호출 이름을 유지하면서 동일한 승인 역할 정책을 사용합니다.
 */
export { requireMember as requireSharedResourceReader } from "@/lib/member";
