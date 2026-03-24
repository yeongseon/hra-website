"use server";

import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { applications, cohorts } from "@/lib/db/schema";

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
