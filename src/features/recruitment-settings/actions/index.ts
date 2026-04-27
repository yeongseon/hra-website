"use server";

import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { recruitmentSettings } from "@/lib/db/schema";

const maxPosterFileSize = 10 * 1024 * 1024;
const posterInputModeSchema = z.enum(["url", "file"]);

const dateStringSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "마감일 형식이 올바르지 않습니다.")
  .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), {
    message: "유효한 마감일을 입력해주세요.",
  });

const recruitmentSettingsSchema = z
  .object({
    posterInputMode: posterInputModeSchema,
    posterImageUrl: z.string().trim().optional(),
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
  })
  .superRefine((value, context) => {
    if (value.posterInputMode !== "url" || !value.posterImageUrl) {
      return;
    }

    if (!value.posterImageUrl.startsWith("http://") && !value.posterImageUrl.startsWith("https://")) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["posterImageUrl"],
        message: "포스터 URL은 http:// 또는 https://로 시작해야 합니다.",
      });
    }
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

function isBlobUrl(url: string) {
  return url.includes(".vercel-storage.com") || url.includes(".blob.vercel-storage.com");
}

function normalizePosterFileName(fileName: string) {
  return fileName.trim().replace(/\s+/g, "-");
}

function validatePosterFile(fileEntry: FormDataEntryValue | null) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return {
      success: true as const,
      file: undefined,
    };
  }

  if (!fileEntry.type.startsWith("image/")) {
    return {
      success: false as const,
      message: "포스터 이미지는 이미지 파일만 업로드할 수 있습니다.",
      fieldErrors: { posterFile: "포스터 이미지는 이미지 파일만 업로드할 수 있습니다." },
    };
  }

  if (fileEntry.size > maxPosterFileSize) {
    return {
      success: false as const,
      message: "포스터 이미지는 10MB 이하만 업로드할 수 있습니다.",
      fieldErrors: { posterFile: "포스터 이미지는 10MB 이하만 업로드할 수 있습니다." },
    };
  }

  return {
    success: true as const,
    file: fileEntry,
  };
}

async function uploadPosterFile(file: File) {
  const safeFileName = normalizePosterFileName(file.name);
  const blob = await put(`recruitment/포스터-${safeFileName}`, file, { access: "public" });

  return blob.url;
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
    posterInputMode: normalizeText(formData.get("posterInputMode")),
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

  const removePoster = normalizeText(formData.get("removePoster")) === "true";
  const validatedPosterFile = validatePosterFile(formData.get("posterFile"));

  if (!validatedPosterFile.success) {
    return {
      success: false,
      message: validatedPosterFile.message,
      fieldErrors: validatedPosterFile.fieldErrors,
    };
  }

  const [existingSettings] = await db
    .select({
      id: recruitmentSettings.id,
      posterImageUrl: recruitmentSettings.posterImageUrl,
    })
    .from(recruitmentSettings)
    .limit(1);

  let nextPosterImageUrl: string | null = existingSettings?.posterImageUrl ?? null;

  if (removePoster) {
    if (existingSettings?.posterImageUrl && isBlobUrl(existingSettings.posterImageUrl)) {
      await del(existingSettings.posterImageUrl);
    }

    nextPosterImageUrl = null;
  }

  if (parsed.data.posterInputMode === "file") {
    if (validatedPosterFile.file) {
      if (existingSettings?.posterImageUrl && !removePoster && isBlobUrl(existingSettings.posterImageUrl)) {
        await del(existingSettings.posterImageUrl);
      }

      nextPosterImageUrl = await uploadPosterFile(validatedPosterFile.file);
    }
  } else {
    nextPosterImageUrl = parsed.data.posterImageUrl ?? null;
  }

  const values = {
    posterImageUrl: nextPosterImageUrl,
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
