/** 과제 서버 액션입니다. DB 감사 확정 후 완료 이벤트를 남기고 서버 요청 참조를 반환합니다. */
"use server";

import { revalidatePath } from "next/cache";
import { academicSqlState, createAcademicObservation, type AcademicAction, type AcademicObservation } from "@/lib/academic-observability";
import * as service from "./service";
import { AssignmentInputError, AssignmentOperationError, type AssignmentMutationResult } from "./validation";

/** 원본 오류는 분류에만 사용하고 로그에는 고정 코드만 전달합니다. */
function recordFailure(observation: AcademicObservation, error: unknown) {
  const known = error instanceof AssignmentInputError || error instanceof AssignmentOperationError;
  observation.emit(observation.authenticatedActorId ? "FAILED" : "DENIED", {
    failureCode: !observation.authenticatedActorId ? "AUTHORIZATION" : known ? "INPUT" : "STORAGE",
    sqlState: academicSqlState(error),
  });
}

async function executeMutation(action: AcademicAction, run: (observation: AcademicObservation) => Promise<AssignmentMutationResult>, message: string) {
  const observation = createAcademicObservation(action, "ASSIGNMENT");
  try {
    const result = await run(observation);
    observation.emit(result.replayed ? "REPLAYED" : "COMPLETED", { resourceId: result.assignment.id });
    revalidatePath("/admin/academics/assignments");
    revalidatePath(`/admin/academics/assignments/${result.assignment.id}`);
    revalidatePath(`/admin/academics/assignments/${result.assignment.id}/submissions`);
    revalidatePath("/member/assignments");
    revalidatePath(`/member/assignments/${result.assignment.id}`);
    return { success: true as const, message, ...result, referenceId: observation.correlationId };
  } catch (error) {
    recordFailure(observation, error);
    const message = error instanceof AssignmentInputError || error instanceof AssignmentOperationError
      ? error.message : "과제를 처리하지 못했습니다. 권한·마감·현재 상태를 확인한 뒤 다시 시도해 주세요.";
    return { success: false as const, message, referenceId: observation.correlationId };
  }
}

export async function createAssignment(input: unknown) {
  return executeMutation("ASSIGNMENT_CREATE", observation => service.createAssignment(input, observation), "과제 초안을 저장했습니다.");
}
export async function updateDraftAssignment(input: unknown) {
  return executeMutation("ASSIGNMENT_UPDATE", observation => service.updateDraftAssignment(input, observation), "과제 초안을 수정했습니다.");
}
export async function publishAssignment(input: unknown) {
  return executeMutation("ASSIGNMENT_PUBLISH", observation => service.publishAssignment(input, observation), "과제 공개 상태를 확인했습니다.");
}
export async function closeAssignment(input: unknown) {
  return executeMutation("ASSIGNMENT_CLOSE", observation => service.closeAssignment(input, observation), "과제를 종료했습니다.");
}
export async function listAssignmentsAdmin(input: unknown = {}) {
  const observation = createAcademicObservation("ASSIGNMENT_LIST", "ASSIGNMENT");
  try {
    const assignments = await service.listAssignmentsAdmin(input, observation);
    observation.emit("COMPLETED");
    return { success: true as const, assignments, referenceId: observation.correlationId };
  } catch (error) {
    recordFailure(observation, error);
    const message = error instanceof AssignmentInputError || error instanceof AssignmentOperationError
      ? error.message : "과제 목록을 불러오지 못했습니다. 권한과 조회 조건을 확인해 주세요.";
    return { success: false as const, message, referenceId: observation.correlationId };
  }
}
