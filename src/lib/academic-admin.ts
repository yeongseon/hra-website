/**
 * 학사 G1 운영 책임자 인가입니다. 홈페이지 ADMIN 역할만으로 승인하지 않습니다.
 * 실제 로그인 세션과 서버 설정의 지정 계정 ID가 모두 일치해야 합니다.
 */
import "server-only";
import { z } from "zod/v4";
import { auth } from "@/lib/auth";
import { canManageAcademics } from "@/lib/academic-access";

// 계정 ID를 추정하거나 최초 관리자를 자동 선택하지 않고 설정 누락 시 차단합니다.
export function getAcademicApproverId(): string {
  const result = z.uuid().safeParse(process.env.ACADEMIC_APPROVER_USER_ID);
  if (!result.success) throw new Error("학사 운영 책임자 계정이 지정되지 않았습니다.");
  return result.data;
}

export async function requireAcademicApprover(): Promise<string> {
  const session = await auth();
  const configuredId = getAcademicApproverId();
  if (!canManageAcademics(session?.user, configuredId)) {
    throw new Error("학사 운영 책임자만 승인할 수 있습니다.");
  }
  return configuredId;
}

// #142 확정 후 별도 운영 승인으로만 활성화합니다. 기본값은 비활성입니다.
export function assertAcademicWritesEnabled(): void {
  if (process.env.ACADEMIC_ENROLLMENT_WRITES_ENABLED !== "true") {
    throw new Error("학적 개인정보 저장이 활성화되지 않았습니다.");
  }
}
