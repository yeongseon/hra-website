/** 학생 명부 등록 입력. 학생 UUID를 지정한 추가 등록과 표시 이름만 받는 신규 등록을 구분한다. */
import { z } from "zod/v4";

const registrationFields = z.object({
  requestId: z.uuid("등록 요청 식별자가 올바르지 않습니다."),
  cohortId: z.uuid("등록할 기수를 선택해 주세요."),
  verificationMethod: z.enum(["IN_PERSON", "VERIFIED_CONTACT"], { error: "본인 확인 방식을 선택해 주세요." }),
  evidenceReference: z.uuid("승인 근거 참조 식별자를 입력해 주세요."),
});

// 기존 학생에 이름 변경을 끼워 넣거나 계정 ID 등 허용하지 않은 필드를 추가할 수 없다.
export const rosterInputSchema = z.union([
  registrationFields.extend({ studentId: z.literal(""), displayName: z.string().trim().min(1).max(100) }).strict(),
  registrationFields.extend({ studentId: z.uuid(), displayName: z.literal("") }).strict(),
], { error: "등록 유형에 맞는 학생 식별자 또는 표시 이름과 승인 근거를 확인해 주세요." });

export type RosterInput = z.infer<typeof rosterInputSchema>;
export type RosterFormState = { error?: string; referenceId?: string };
