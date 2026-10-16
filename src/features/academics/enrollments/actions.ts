/** 학적 연결 서버 액션입니다. 공개 입력으로 로그인 주체를 지정할 수 없습니다. */
"use server";

import { academicSqlState, createAcademicObservation } from "@/lib/academic-observability";
import { applyEnrollmentLinkPlan } from "./service";

export async function linkAcademicEnrollments(input: unknown) {
  const observation = createAcademicObservation("ENROLLMENT_LINK", "ENROLLMENT_BATCH");
  try {
    const result = await applyEnrollmentLinkPlan(input, observation);
    observation.emit(result.replayed ? "REPLAYED" : "COMPLETED");
    return { success: true as const, ...result, referenceId: observation.correlationId };
  } catch (error) {
    observation.emit(observation.authenticatedActorId ? "FAILED" : "DENIED", {
      failureCode: observation.authenticatedActorId ? "UNKNOWN" : "AUTHORIZATION", sqlState: academicSqlState(error),
    });
    return { success: false as const, referenceId: observation.correlationId,
      message: "학적 연결을 완료하지 못했습니다. 승인 계획과 계정 상태를 확인해 주세요." };
  }
}
