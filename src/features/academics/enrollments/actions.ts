/** 학적 연결 서버 액션입니다. 공개 입력으로 로그인 주체를 지정할 수 없습니다. */
"use server";

import { logServerError } from "@/lib/errors";
import { applyEnrollmentLinkPlan } from "./service";

export async function linkAcademicEnrollments(input: unknown) {
  try {
    const result = await applyEnrollmentLinkPlan(input);
    return { success: true as const, ...result };
  } catch (error) {
    logServerError("academic-enrollments/link", error);
    return { success: false as const, message: "학적 연결을 완료하지 못했습니다. 승인 계획과 계정 상태를 확인해 주세요." };
  }
}
