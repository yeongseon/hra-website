/** 과제 서버 액션입니다. 한국어 결과를 반환하고 성공한 변경의 관련 경로만 갱신합니다. */
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { logServerError } from "@/lib/errors";
import * as service from "./service";
import { AssignmentInputError, AssignmentOperationError, type AssignmentMutationResult } from "./validation";

const requestContextSchema = z.object({ requestId: z.uuid().optional(), correlationId: z.uuid().optional() });

/** 원본 Drizzle 오류에는 SQL·params가 있으므로 고정 오류와 검증된 식별자만 로깅합니다. */
function logAssignmentFailure(scope: string, error: unknown, input?: unknown) {
  const context: Record<string, string> = {};
  const requestContext = requestContextSchema.safeParse(input);
  if (requestContext.success) {
    if (requestContext.data.requestId) context.requestId = requestContext.data.requestId;
    if (requestContext.data.correlationId) context.correlationId = requestContext.data.correlationId;
  }
  let current: unknown = error;
  try {
    for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth++) {
      if ("code" in current && typeof current.code === "string" && /^[A-Z0-9]{5}$/.test(current.code)) {
        context.sqlState = current.code;
        break;
      }
      current = "cause" in current ? current.cause : null;
    }
  } catch {
    // 오류 속성 접근이 실패해도 원본이나 임의 값을 로그로 보내지 않습니다.
    delete context.sqlState;
  }
  logServerError(scope, new Error("과제 서버 처리 실패"), context);
}

async function executeMutation(run: () => Promise<AssignmentMutationResult>, message: string, input: unknown) {
  try {
    const result = await run();
    revalidatePath("/admin/academics/assignments");
    revalidatePath(`/admin/academics/assignments/${result.assignment.id}`);
    revalidatePath(`/admin/academics/assignments/${result.assignment.id}/submissions`);
    revalidatePath("/member/assignments");
    revalidatePath(`/member/assignments/${result.assignment.id}`);
    return { success: true as const, message, ...result };
  } catch (error) {
    if (error instanceof AssignmentInputError || error instanceof AssignmentOperationError) {
      return { success: false as const, message: error.message };
    }
    logAssignmentFailure("academic-assignments/mutate", error, input);
    return { success: false as const, message: "과제를 처리하지 못했습니다. 권한·마감·현재 상태를 확인한 뒤 다시 시도해 주세요." };
  }
}

export async function createAssignment(input: unknown) {
  return executeMutation(() => service.createAssignment(input), "과제 초안을 저장했습니다.", input);
}
export async function updateDraftAssignment(input: unknown) {
  return executeMutation(() => service.updateDraftAssignment(input), "과제 초안을 수정했습니다.", input);
}
export async function publishAssignment(input: unknown) {
  return executeMutation(() => service.publishAssignment(input), "과제 공개 상태를 확인했습니다.", input);
}
export async function closeAssignment(input: unknown) {
  return executeMutation(() => service.closeAssignment(input), "과제를 종료했습니다.", input);
}
export async function listAssignmentsAdmin(input: unknown = {}) {
  try { return { success: true as const, assignments: await service.listAssignmentsAdmin(input) }; }
  catch (error) {
    if (error instanceof AssignmentInputError || error instanceof AssignmentOperationError) {
      return { success: false as const, message: error.message };
    }
    logAssignmentFailure("academic-assignments/list", error, input);
    return { success: false as const, message: "과제 목록을 불러오지 못했습니다. 권한과 조회 조건을 확인해 주세요." };
  }
}
