/** 학생 과제 업로드의 공개 입력·오류 계약. 저장 경로와 원본 이름을 분리한다. */
import { z } from "zod/v4";

export const MAX_ASSIGNMENT_UPLOAD_BYTES = 50 * 1024 * 1024;
export const assignmentUploadInput = z.object({
  assignmentId: z.uuid(), requestId: z.uuid(),
  originalName: z.string().trim().min(1).max(255).refine(value => !/[\x00-\x1f\x7f/\\]/.test(value) && /\.pdf$/i.test(value), "PDF 파일 이름을 확인해 주세요."),
  sizeBytes: z.number().int().min(1).max(MAX_ASSIGNMENT_UPLOAD_BYTES),
  mimeType: z.literal("application/pdf"),
}).strict();
export const assignmentUploadSelection = z.object({ assignmentId: z.uuid(), uploadIntentId: z.uuid() }).strict();

const errors = {
  INVALID_FILE: [422, "비어 있지 않은 PDF 파일 한 개를 50MiB 이하로 선택해 주세요."],
  NOT_FOUND: [404, "업로드를 찾을 수 없습니다."],
  EXPIRED: [409, "업로드 유효기간 또는 과제 마감이 지났습니다."],
  CONFLICT: [409, "진행 중이거나 이미 완료된 요청입니다. 업로드 상태를 확인해 주세요."],
  NOT_READY: [409, "파일 저장을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요."],
  RATE_LIMITED: [429, "업로드 요청이 많습니다. 잠시 후 다시 시도해 주세요."],
  DISABLED: [404, "과제 업로드를 준비하고 있습니다."],
  UNAVAILABLE: [503, "업로드를 처리할 수 없습니다. 잠시 후 다시 시도해 주세요."],
} as const;
export type AcademicUploadErrorCode = keyof typeof errors;
export class AcademicUploadError extends Error {
  readonly status: number;
  constructor(readonly code: AcademicUploadErrorCode) { super(errors[code][1]); this.status=errors[code][0]; this.name="AcademicUploadError"; }
}
export function academicUploadPath(id: string): string { return `academic-uploads/v1/${id.toLowerCase()}/document.pdf`; }
export function assertAcademicUploadsEnabled(): void {
  if (process.env.ACADEMIC_ENABLED !== "true" || process.env.ACADEMIC_UPLOADS_ENABLED !== "true") throw new AcademicUploadError("DISABLED");
}
