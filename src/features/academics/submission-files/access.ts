/**
 * 개인 제출 파일 API의 요청 주체를 실제 세션으로 확인합니다.
 * 홈페이지 ADMIN·일반 교수 역할만으로 허용하지 않으며, 객체 소유권은 이어지는 DB 조인에서 재검사합니다.
 */
import "server-only";
import { auth } from "@/lib/auth";
import { canManageAcademics } from "@/lib/academic-access";
import { isValidUuid } from "@/lib/auth-session";

const failures = {
  UNAUTHENTICATED: { status: 401, message: "로그인이 필요합니다." },
  FORBIDDEN: { status: 403, message: "과제 파일에 접근할 수 없습니다." },
  NOT_FOUND: { status: 404, message: "파일을 찾을 수 없습니다." },
  UNAVAILABLE: { status: 503, message: "파일을 제공할 수 없습니다. 잠시 후 다시 시도해 주세요." },
} as const;

export class SubmissionFileAccessError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof failures) {
    super(failures[code].message);
    this.name = "SubmissionFileAccessError";
    this.status = failures[code].status;
  }
}

// 이 값은 서버 내부의 조회 입력이며 클라이언트가 제출하거나 권한 증명으로 재사용하지 않습니다.
export interface SubmissionFileReader {
  userId: string;
  scope: "OWNER" | "MANAGEMENT";
  approverId: string | null;
}

/** 인증·역할·전체 기능 gate를 먼저 검사하여 비활성 환경에서 학사 표를 조회하지 않습니다. */
export async function requireSubmissionFileReader(): Promise<SubmissionFileReader> {
  let session;
  try { session = await auth(); }
  catch { throw new SubmissionFileAccessError("UNAVAILABLE"); }
  if (!session?.user || !isValidUuid(session.user.id)) throw new SubmissionFileAccessError("UNAUTHENTICATED");
  const configured = process.env.ACADEMIC_APPROVER_USER_ID;
  const management = canManageAcademics(session.user, configured);
  if (!management && session.user.role !== "MEMBER") throw new SubmissionFileAccessError("FORBIDDEN");
  if (process.env.ACADEMIC_ENABLED !== "true") throw new SubmissionFileAccessError("NOT_FOUND");
  return { userId: session.user.id, scope: management ? "MANAGEMENT" : "OWNER",
    approverId: isValidUuid(configured) ? configured : null };
}
