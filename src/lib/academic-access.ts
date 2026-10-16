/** 학사 운영 책임자 접근의 공통 순수 정책입니다. 이메일이나 ADMIN 역할로 추정하지 않습니다. */
import { isValidUuid } from "@/lib/auth-session";

export function canManageAcademics(
  user: { id?: string; role?: string } | null | undefined,
  configuredId = process.env.ACADEMIC_APPROVER_USER_ID,
): boolean {
  return isValidUuid(configuredId) && user?.id === configuredId &&
    (user.role === "ADMIN" || user.role === "FACULTY" || user.role === "MEMBER");
}
