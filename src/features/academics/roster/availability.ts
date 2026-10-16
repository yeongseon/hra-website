/** 학사 기능의 단계적 공개 경계. 운영 준비 전에는 학사 테이블을 조회하거나 변경하지 않는다. */
import "server-only";
import { requireAcademicApprover } from "@/lib/academic-admin";

export function assertAcademicEnabled(): void {
  if (process.env.ACADEMIC_ENABLED !== "true") {
    throw new Error("학사관리 기능을 준비하고 있습니다.");
  }
}

/** 준비 안내도 지정 승인자에게만 제공한다. 레이아웃과 각 페이지에서 별도로 확인한다. */
export async function getAcademicAvailability(): Promise<boolean> {
  await requireAcademicApprover();
  return process.env.ACADEMIC_ENABLED === "true";
}
