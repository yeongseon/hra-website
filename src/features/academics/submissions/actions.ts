/** 제출 최종화 액션입니다. 실패 시 객체를 삭제하지 않고 같은 키로 결과를 복구할 수 있게 합니다. */
"use server";

import { revalidatePath } from "next/cache";
import { academicSqlState, createAcademicObservation } from "@/lib/academic-observability";
import { AcademicAccessError } from "@/lib/academic-permissions";
import { AcademicUploadError } from "@/features/academics/assignment-uploads/contract";
import * as service from "./service";
import { SubmissionFinalizationError } from "./validation";

export async function finalizeAssignmentSubmission(input: unknown) {
  const observation=createAcademicObservation("SUBMISSION_FINALIZE","SUBMISSION");
  try {
    const result = await service.finalizeAssignmentSubmission(input,observation);
    observation.emit(result.replayed?"REPLAYED":"COMPLETED",{resourceId:result.submissionId});
    revalidatePath("/member/assignments");
    revalidatePath(`/member/assignments/${result.assignmentId}`);
    revalidatePath("/admin/academics/assignments");
    revalidatePath(`/admin/academics/assignments/${result.assignmentId}/submissions`);
    return { success: true as const, message: "과제 제출을 완료했습니다.", ...result, referenceId:observation.correlationId };
  } catch (error) {
    const known=error instanceof AcademicAccessError || error instanceof AcademicUploadError || error instanceof SubmissionFinalizationError;
    const code=known?error.code:null;
    const denied=code!==null && ["UNAUTHENTICATED","FORBIDDEN","NOT_FOUND"].includes(code);
    observation.emit(denied?"DENIED":"FAILED",{
      failureCode:denied?"AUTHORIZATION":code==="INVALID_INPUT" || code==="INVALID_FILE"?"INPUT":code==="DISABLED"?"GATE"
        :code!==null && ["CONFLICT","EXPIRED","DEADLINE","RATE_LIMITED"].includes(code)?"CONFLICT":code==="NOT_READY"?"NOT_READY":"STORAGE",
      sqlState:academicSqlState(error),
    });
    if (known) {
      return { success: false as const, status: error.status, code: error.code, message: error.message, referenceId:observation.correlationId };
    }
    // 원본 오류에는 SQL·params·파일명이 있어 고정 오류만 로그에 전달합니다.
    return { success: false as const, status: 503, code: "UNAVAILABLE" as const,
      message: "제출을 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요.", referenceId:observation.correlationId };
  }
}
