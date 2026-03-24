/**
 * 지원서 제출 서버 액션 파일
 * 
 * 역할: 사용자가 프로그램에 지원할 때 지원서를 데이터베이스에 저장하는 파일입니다.
 * 특징: 회원가입 없이도 비회원이 지원할 수 있습니다.
 * 예: 누구나 이메일 주소와 간단한 정보만으로 지원서를 제출할 수 있습니다.
 * 
 * "use server" 표기: 이 파일의 모든 함수는 서버에서만 실행되므로, 비밀 정보(DB 접근)를 안전하게 다룰 수 있습니다.
 */
"use server";

import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { applications, cohorts } from "@/lib/db/schema";

/**
 * 지원서 입력값 유효성 검사 스키마
 * 
 * Zod는 입력된 데이터가 정확한 형식인지 확인하는 도구입니다.
 * 예: "name"이 정말 텍스트인지? 이메일 형식이 맞는지? 이런 것들을 체크합니다.
 * 
 * 각 필드:
 * - cohortId: 지원할 기수의 고유 ID (필수)
 * - name, email, motivation: 필수 입력 항목
 * - phone, university, major, additionalInfo: 선택 입력 항목 (optional)
 */
const applicationSchema = z.object({
  cohortId: z.uuid(),
  name: z.string().trim().min(1, "이름을 입력해주세요."),
  email: z.email("올바른 이메일을 입력해주세요."),
  phone: z
    .string()
    .trim()
    .max(20, "전화번호는 20자 이하여야 합니다.")
    .optional(),
  university: z
    .string()
    .trim()
    .max(100, "대학교명은 100자 이하여야 합니다.")
    .optional(),
  major: z
    .string()
    .trim()
    .max(100, "전공은 100자 이하여야 합니다.")
    .optional(),
  motivation: z.string().trim().min(1, "지원 동기를 입력해주세요."),
  additionalInfo: z.string().trim().optional(),
});

export type SubmitApplicationState = {
  success: boolean;
  message: string;
};

const normalizeText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

/**
 * 지원서 제출 서버 액션
 * 
 * 역할: 사용자가 입력한 지원서를 검증하고 데이터베이스에 저장하는 함수입니다.
 * 
 * 매개변수:
 * - _prevState: useActionState 훅에서 이전 상태를 받아오기 위한 매개변수
 *   (Next.js의 useActionState는 함수의 첫 매개변수로 이전 상태를 자동 전달)
 * - formData: 지원서 폼에서 입력한 데이터
 * 
 * 단계:
 * 1. 입력값 검증 (applicationSchema로 체크)
 * 2. 기수의 모집 상태 확인 (OPEN 상태일 때만 지원 가능)
 * 3. 검증 통과 시 지원서 저장
 * 4. 결과 메시지 반환
 * 
 * 반환값: { success, message } 형태의 상태 정보
 */
export async function submitApplication(
  _prevState: SubmitApplicationState,
  formData: FormData
): Promise<SubmitApplicationState> {
  const parsed = applicationSchema.safeParse({
    cohortId: normalizeText(formData.get("cohortId")),
    name: normalizeText(formData.get("name")),
    email: normalizeText(formData.get("email")),
    phone: normalizeText(formData.get("phone")) || undefined,
    university: normalizeText(formData.get("university")) || undefined,
    major: normalizeText(formData.get("major")) || undefined,
    motivation: normalizeText(formData.get("motivation")),
    additionalInfo: normalizeText(formData.get("additionalInfo")) || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
    };
  }

  const [cohort] = await db
    .select({
      id: cohorts.id,
      recruitmentStatus: cohorts.recruitmentStatus,
    })
    .from(cohorts)
    .where(eq(cohorts.id, parsed.data.cohortId))
    .limit(1);

  if (!cohort || cohort.recruitmentStatus !== "OPEN") {
    return {
      success: false,
      message: "현재 접수 가능한 모집이 아닙니다.",
    };
  }

  await db.insert(applications).values({
    cohortId: parsed.data.cohortId,
    applicantName: parsed.data.name,
    applicantEmail: parsed.data.email,
    applicantPhone: parsed.data.phone,
    university: parsed.data.university,
    major: parsed.data.major,
    motivation: parsed.data.motivation,
    additionalInfo: parsed.data.additionalInfo,
  });

  return {
    success: true,
    message: "지원서가 제출되었습니다. 감사합니다!",
  };
}
