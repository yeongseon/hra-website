/**
 * 웹 서비스와 신뢰된 운영자 CLI가 공유하는 수동 승인 계획 검증입니다.
 * 이름·이메일을 받지 않으며 현재 회원 기수는 변경 감지용으로만 사용합니다.
 */
import { z } from "zod/v4";

// UUID의 대소문자 표기만 다른 중복도 동일 식별자로 검증합니다.
const identifier = z.uuid().toLowerCase();

// 같은 학생의 여러 기수는 별도 요청으로 처리해 승인 한 건의 의미를 명확히 합니다.
export const enrollmentLinkSchema = z.object({
  studentId: identifier,
  userId: identifier,
  cohortId: identifier,
  expectedRole: z.enum(["ADMIN", "FACULTY", "MEMBER"]),
  expectedCohortId: identifier.nullable(),
}).strict();

export const enrollmentPlanSchema = z.object({
  requestId: identifier,
  approverUserId: identifier,
  approvalReferenceId: identifier,
  verificationMethod: z.enum(["IN_PERSON", "VERIFIED_CONTACT"]),
  links: z.array(enrollmentLinkSchema).min(1).max(100),
}).strict().superRefine((plan, context) => {
  for (const key of ["studentId", "userId"]) {
    if (new Set(plan.links.map(link => link[key])).size !== plan.links.length) {
      context.addIssue({ code: "custom", message: "학생 또는 계정 ID가 중복되었습니다." });
    }
  }
});
