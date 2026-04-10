"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { recruitmentSettings } from "@/lib/db/schema";

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "마감일 형식이 올바르지 않습니다.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "유효한 마감일을 입력해주세요.",
  });

const recruitmentSettingsSchema = z.object({
  posterImageUrl: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || value.startsWith("http://") || value.startsWith("https://"), {
      message: "포스터 URL은 http:// 또는 https://로 시작해야 합니다.",
    }),
  deadlineDate: dateStringSchema,
  nextRecruitmentYear: z.coerce
    .number({ message: "모집연도는 숫자여야 합니다." })
    .int("모집연도는 정수여야 합니다.")
    .min(2000, "모집연도는 2000년 이후여야 합니다.")
    .max(3000, "모집연도를 확인해주세요."),
  nextRecruitmentMonth: z.coerce
    .number({ message: "모집월은 숫자여야 합니다." })
    .int("모집월은 정수여야 합니다.")
    .min(1, "모집월은 1~12 사이여야 합니다.")
    .max(12, "모집월은 1~12 사이여야 합니다."),
  qualificationText: z.string().trim().max(5000, "자격요건 텍스트는 5000자 이하여야 합니다.").optional(),
});

export type RecruitmentSettingsActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function toDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function issuesToFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

export async function getRecruitmentSettings() {
  await requireAdmin();

  const [settings] = await db.select().from(recruitmentSettings).limit(1);

  return settings ?? null;
}

export async function updateRecruitmentSettings(
  formData: FormData
): Promise<RecruitmentSettingsActionState> {
  await requireAdmin();

  const parsed = recruitmentSettingsSchema.safeParse({
    posterImageUrl: normalizeText(formData.get("posterImageUrl")) || undefined,
    deadlineDate: normalizeText(formData.get("deadlineDate")),
    nextRecruitmentYear: normalizeText(formData.get("nextRecruitmentYear")),
    nextRecruitmentMonth: normalizeText(formData.get("nextRecruitmentMonth")),
    qualificationText: normalizeText(formData.get("qualificationText")) || undefined,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const [existingSettings] = await db.select({ id: recruitmentSettings.id }).from(recruitmentSettings).limit(1);

  const values = {
    posterImageUrl: parsed.data.posterImageUrl ?? null,
    deadlineDate: toDate(parsed.data.deadlineDate),
    nextRecruitmentYear: parsed.data.nextRecruitmentYear,
    nextRecruitmentMonth: parsed.data.nextRecruitmentMonth,
    qualificationText: parsed.data.qualificationText ?? null,
  };

  if (!existingSettings) {
    await db.insert(recruitmentSettings).values(values);
  } else {
    await db
      .update(recruitmentSettings)
      .set(values)
      .where(eq(recruitmentSettings.id, existingSettings.id));
  }

  revalidatePath("/recruitment");
  revalidatePath("/admin/recruitment-settings");

  return {
    success: true,
    message: "모집 설정을 저장했습니다.",
  };
}
