/**
 * 공용 API 계약 패키지의 공개 진입점입니다.
 * 전송 스키마·DTO와 순수 역할/이메일 값을 Web·모바일에 동일하게 제공합니다.
 */
export * from "./api-v1";
export { USER_ROLES, isOAuthPlaceholderEmail, getDisplayEmail } from "./identity";
export type { UserRole } from "./identity";
