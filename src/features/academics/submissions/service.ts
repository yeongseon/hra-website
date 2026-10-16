/** 실제 파일 검증과 원자 제출을 연결합니다. 성공 재시도는 Blob 요청보다 먼저 복구합니다. */
import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { assertAcademicWritesEnabled } from "@/lib/academic-admin";
import { requireAssignmentTarget } from "@/lib/academic-permissions";
import type { AcademicObservation } from "@/lib/academic-observability";
import { verifyAssignmentUploadIntent } from "@/features/academics/assignment-uploads/server";
import { finalizedSubmissionSchema, finalizeSubmissionSchema, SubmissionFinalizationError,
  translateFinalizationError, type FinalizeSubmissionInput } from "./validation";

/** 같은 SQL wrapper로 현재 권한 확인·동일 키 복구 또는 최종화를 수행합니다. */
async function completeSubmission(target: { userId: string; targetId: string }, input: FinalizeSubmissionInput, finalize: boolean) {
  try {
    const result = await db.execute(sql`SELECT public.complete_academic_assignment_submission(
      ${target.targetId}::uuid, ${target.userId}::uuid, ${input.uploadIntentId}::uuid,
      ${input.submissionKey}::uuid, ${finalize}::boolean
    ) AS result`);
    const value = result.rows[0]?.result;
    if (value === null) return null;
    return finalizedSubmissionSchema.parse(value);
  } catch (error) {
    throw translateFinalizationError(error);
  }
}

export async function finalizeAssignmentSubmission(input: unknown, observation?: AcademicObservation) {
  const parsed = finalizeSubmissionSchema.safeParse(input);
  if (!parsed.success) throw new SubmissionFinalizationError("INVALID_INPUT");
  const request = parsed.data;
  const target = await requireAssignmentTarget({ assignmentId: request.assignmentId });
  observation?.authenticated(target.userId);
  observation?.identify({requestId:request.submissionKey});
  observation?.emit("AUTHORIZED");
  const replay = await completeSubmission(target, request, false);
  if (replay) return replay;
  // 쓰기 중단은 새로운 검증·최종화에 적용하고, 이미 커밋된 성공 조회는 위에서 복구합니다.
  try { assertAcademicWritesEnabled(); }
  catch { throw new SubmissionFinalizationError("DISABLED"); }
  await verifyAssignmentUploadIntent({ assignmentId: request.assignmentId, uploadIntentId: request.uploadIntentId },
    observation?.fork("UPLOAD_VERIFY","UPLOAD_INTENT"));
  // 외부 객체를 읽는 동안 세션·배정이 달라졌으면 새로운 권한으로 이어 제출하지 않습니다.
  const current = await requireAssignmentTarget({ assignmentId: request.assignmentId });
  if (current.userId !== target.userId || current.targetId !== target.targetId) throw new SubmissionFinalizationError("FORBIDDEN");
  const result = await completeSubmission(current, request, true);
  if (!result) throw new SubmissionFinalizationError("UNAVAILABLE");
  return result;
}
