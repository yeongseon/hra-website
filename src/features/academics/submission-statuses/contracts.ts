/** 과제 공개 스냅샷 현황의 입력·최소 응답 및 고정 한국어 오류 계약이다. */
import { z } from "zod/v4";
import { UUID_PATTERN } from "@/lib/auth-session";

// 기수는 정확한 UUID 일치 조건이고 검색은 와일드카드 없는 이름 부분 문자열이다.
export const submissionStatusInput = z.object({
  assignmentId: z.string().regex(UUID_PATTERN),
  cohortId: z.string().regex(UUID_PATTERN).optional(),
  status: z.enum(["ALL", "SUBMITTED", "UNSUBMITTED"]).default("ALL"),
  search: z.string().trim().max(100).default(""),
  sort: z.enum(["name", "submittedAt"]).default("name"),
  direction: z.enum(["asc", "desc"]).default("asc"),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(100).default(30),
}).strict();
export type SubmissionStatusInput = z.input<typeof submissionStatusInput>;
export type ParsedSubmissionStatusInput = z.output<typeof submissionStatusInput>;

// 저장 키·URL·이메일·학적 계정 ID 없이 운영 확인에 필요한 필드만 고른다.
export const submissionStatusRow = z.object({
  targetId: z.string().regex(UUID_PATTERN), displayName: z.string(), accountLinked: z.boolean(), enrollmentActive: z.boolean(),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
});
export const submissionStatusSnapshot = z.object({
  assignment: z.object({ id: z.string().regex(UUID_PATTERN), title: z.string(), cohortId: z.string().regex(UUID_PATTERN), status: z.enum(["PUBLISHED", "CLOSED"]) }),
  counts: z.object({ total: z.number().int().nonnegative(), submitted: z.number().int().nonnegative(), unsubmitted: z.number().int().nonnegative() }),
  filteredCount: z.number().int().nonnegative(), rows: z.array(submissionStatusRow),
});
export type SubmissionStatusSnapshot = z.output<typeof submissionStatusSnapshot>;
export type SubmissionStatusRow = z.output<typeof submissionStatusRow>;

const errors = {
  FORBIDDEN: { status: 403, message: "지정된 학사 운영 책임자만 조회할 수 있습니다." },
  NOT_FOUND: { status: 404, message: "과제를 찾을 수 없습니다." },
  INVALID_INPUT: { status: 422, message: "조회 조건이 올바르지 않습니다." },
  TOO_MANY_ROWS: { status: 422, message: "내보낼 대상이 너무 많습니다. 검색이나 제출 상태로 범위를 줄여 주세요." },
  UNAVAILABLE: { status: 503, message: "제출 현황을 조회할 수 없습니다. 잠시 후 다시 시도해 주세요." },
} as const;
export class SubmissionStatusError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) { super(errors[code].message); this.name = "SubmissionStatusError"; this.status = errors[code].status; }
}

// 페이지/API에서 중복·미지원 쿼리를 숨기지 않고 인증 뒤 입력 검증에서 거부하게 만든다.
export function submissionStatusRequestInput(assignmentId: string, params: URLSearchParams): unknown {
  const input: Record<string, unknown> = { assignmentId };
  const allowed = new Set(["cohortId", "status", "search", "sort", "direction", "page", "pageSize"]);
  for (const [key, value] of params) {
    if (!allowed.has(key) || params.getAll(key).length !== 1) return { assignmentId, invalidQuery: true };
    input[key] = key === "page" || key === "pageSize" ? Number(value) : value;
  }
  return input;
}
