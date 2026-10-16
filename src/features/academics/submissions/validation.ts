/** 제출 최종화의 공개 입력·최소 결과·고정 오류 계약입니다. 저장 키와 메타는 입력받지 않습니다. */
import { z } from "zod/v4";

const identifier = z.uuid().toLowerCase();
export const finalizeSubmissionSchema = z.object({
  assignmentId: identifier, uploadIntentId: identifier, submissionKey: identifier,
}).strict();
export type FinalizeSubmissionInput = z.infer<typeof finalizeSubmissionSchema>;

export const finalizedSubmissionSchema = z.object({
  assignmentId: identifier, submissionId: identifier,
  submittedAt: z.iso.datetime({ offset: true }), replayed: z.boolean(),
  file: z.object({ fileId: identifier, originalName: z.string().min(1).max(255),
    mimeType: z.literal("application/pdf"), sizeBytes: z.number().int().min(1).max(52428800) }).strict(),
}).strict();
export type FinalizedSubmission = z.infer<typeof finalizedSubmissionSchema>;

const failureDetails = {
  DISABLED: { status: 404, message: "과제 제출을 준비 중입니다." },
  INVALID_INPUT: { status: 422, message: "제출 요청을 확인해 주세요." },
  FORBIDDEN: { status: 404, message: "제출할 과제를 찾을 수 없습니다." },
  CONFLICT: { status: 409, message: "이미 제출했거나 다른 제출에 사용한 요청입니다. 제출 내역을 확인해 주세요." },
  EXPIRED: { status: 409, message: "업로드 유효기간이 지났습니다. 파일을 다시 올려 주세요." },
  NOT_READY: { status: 409, message: "파일 업로드 검증이 완료되지 않았습니다." },
  DEADLINE: { status: 409, message: "과제가 종료되었거나 제출 마감 시각이 지났습니다." },
  UNAVAILABLE: { status: 503, message: "제출을 확인하지 못했습니다. 같은 요청으로 다시 시도해 주세요." },
} as const;
export type SubmissionFailureCode = keyof typeof failureDetails;

export class SubmissionFinalizationError extends Error {
  readonly status: number;
  constructor(readonly code: SubmissionFailureCode) {
    super(failureDetails[code].message);
    this.name = "SubmissionFinalizationError";
    this.status = failureDetails[code].status;
  }
}

/** 알려진 SQLSTATE만 해석하고 SQL·params·원본 message는 응답에 복사하지 않습니다. */
export function translateFinalizationError(error: unknown): SubmissionFinalizationError {
  const codes: Record<string, SubmissionFailureCode> = {
    SUB01: "CONFLICT", SUB02: "FORBIDDEN", SUB03: "EXPIRED", SUB04: "NOT_READY", SUB05: "DEADLINE",
    "23505": "CONFLICT",
  };
  let current: unknown = error;
  try {
    for (let depth = 0; depth < 3 && typeof current === "object" && current !== null; depth++) {
      if ("code" in current && typeof current.code === "string" && Object.hasOwn(codes, current.code)) {
        return new SubmissionFinalizationError(codes[current.code]);
      }
      if ("code" in current && current.code === "P0001" && "message" in current) {
        if (current.message === "upload_conflict") return new SubmissionFinalizationError("CONFLICT");
        if (current.message === "upload_expired") return new SubmissionFinalizationError("EXPIRED");
        if (current.message === "upload_not_found") return new SubmissionFinalizationError("FORBIDDEN");
      }
      current = "cause" in current ? current.cause : null;
    }
  } catch {
    return new SubmissionFinalizationError("UNAVAILABLE");
  }
  return new SubmissionFinalizationError("UNAVAILABLE");
}
