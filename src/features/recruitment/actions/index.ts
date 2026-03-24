"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";

const statusSchema = z.enum(["UPCOMING", "OPEN", "CLOSED"]);

const cohortSchema = z
  .object({
    name: z.string().trim().min(1, "기수명을 입력해주세요.").max(100, "기수명은 100자 이하여야 합니다."),
    description: z
      .string()
      .trim()
      .max(5000, "설명은 5000자 이하여야 합니다.")
      .optional(),
    startDate: z.string().trim().optional(),
    endDate: z.string().trim().optional(),
    recruitmentStartDate: z.string().trim().optional(),
    recruitmentEndDate: z.string().trim().optional(),
    recruitmentStatus: statusSchema,
    isActive: z.boolean(),
    order: z.coerce
      .number({ message: "정렬 순서는 숫자여야 합니다." })
      .int("정렬 순서는 정수여야 합니다."),
  })
  .superRefine((data, ctx) => {
    const parseDateString = (value: string | undefined, path: string) => {
      if (!value) {
        return null;
      }

      const isDateInputFormat = /^\d{4}-\d{2}-\d{2}$/.test(value);
      if (!isDateInputFormat) {
        ctx.addIssue({
          code: "custom",
          message: "날짜 형식이 올바르지 않습니다.",
          path: [path],
        });
        return null;
      }

      const parsed = new Date(`${value}T00:00:00`);
      if (Number.isNaN(parsed.getTime())) {
        ctx.addIssue({
          code: "custom",
          message: "유효한 날짜를 입력해주세요.",
          path: [path],
        });
        return null;
      }

      return parsed;
    };

    const startDate = parseDateString(data.startDate, "startDate");
    const endDate = parseDateString(data.endDate, "endDate");
    const recruitmentStartDate = parseDateString(data.recruitmentStartDate, "recruitmentStartDate");
    const recruitmentEndDate = parseDateString(data.recruitmentEndDate, "recruitmentEndDate");

    if (startDate && endDate && startDate > endDate) {
      ctx.addIssue({
        code: "custom",
        message: "기수 시작일은 종료일보다 늦을 수 없습니다.",
        path: ["endDate"],
      });
    }

    if (recruitmentStartDate && recruitmentEndDate && recruitmentStartDate > recruitmentEndDate) {
      ctx.addIssue({
        code: "custom",
        message: "모집 시작일은 모집 종료일보다 늦을 수 없습니다.",
        path: ["recruitmentEndDate"],
      });
    }
  });

export type CohortActionState = {
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

function toDateOrNull(value: string | undefined) {
  if (!value) {
    return null;
  }
  return new Date(`${value}T00:00:00`);
}

function issuesToFieldErrors(issues: z.ZodIssue[]) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

function parseCohortFormData(formData: FormData) {
  return cohortSchema.safeParse({
    name: normalizeText(formData.get("name")),
    description: normalizeText(formData.get("description")) || undefined,
    startDate: normalizeText(formData.get("startDate")) || undefined,
    endDate: normalizeText(formData.get("endDate")) || undefined,
    recruitmentStartDate: normalizeText(formData.get("recruitmentStartDate")) || undefined,
    recruitmentEndDate: normalizeText(formData.get("recruitmentEndDate")) || undefined,
    recruitmentStatus: normalizeText(formData.get("recruitmentStatus")),
    isActive: formData.get("isActive") === "on",
    order: normalizeText(formData.get("order")) || "0",
  });
}

export async function createCohort(formData: FormData): Promise<CohortActionState> {
  await requireAdmin();

  const parsed = parseCohortFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await db.insert(cohorts).values({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    startDate: toDateOrNull(parsed.data.startDate),
    endDate: toDateOrNull(parsed.data.endDate),
    recruitmentStartDate: toDateOrNull(parsed.data.recruitmentStartDate),
    recruitmentEndDate: toDateOrNull(parsed.data.recruitmentEndDate),
    recruitmentStatus: parsed.data.recruitmentStatus,
    isActive: parsed.data.isActive,
    order: parsed.data.order,
  });

  revalidatePath("/admin/recruitment");
  redirect("/admin/recruitment");
}

export async function updateCohort(id: string, formData: FormData): Promise<CohortActionState> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 기수 ID입니다.",
    };
  }

  const parsed = parseCohortFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await db
    .update(cohorts)
    .set({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      startDate: toDateOrNull(parsed.data.startDate),
      endDate: toDateOrNull(parsed.data.endDate),
      recruitmentStartDate: toDateOrNull(parsed.data.recruitmentStartDate),
      recruitmentEndDate: toDateOrNull(parsed.data.recruitmentEndDate),
      recruitmentStatus: parsed.data.recruitmentStatus,
      isActive: parsed.data.isActive,
      order: parsed.data.order,
    })
    .where(eq(cohorts.id, parsedId.data));

  revalidatePath("/admin/recruitment");
  redirect("/admin/recruitment");
}

export async function deleteCohort(id: string) {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  await db.delete(cohorts).where(eq(cohorts.id, parsedId.data));
  revalidatePath("/admin/recruitment");
}

export async function updateRecruitmentStatus(
  id: string,
  status: "UPCOMING" | "OPEN" | "CLOSED"
) {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  const parsedStatus = statusSchema.safeParse(status);
  if (!parsedId.success || !parsedStatus.success) {
    return;
  }

  await db
    .update(cohorts)
    .set({ recruitmentStatus: parsedStatus.data })
    .where(eq(cohorts.id, parsedId.data));

  revalidatePath("/admin/recruitment");
}
