"use server";

import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { weeklyTexts } from "@/lib/db/schema";

export type WeeklyTextActionState = {
  success: boolean;
  error?: string;
};

const weeklyTextIdSchema = z.uuid("유효하지 않은 주차별 텍스트 ID입니다.");

const weeklyTextFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  cohortId: z.union([z.uuid(), z.literal("")]).optional(),
});

const allowedFileTypes = new Set([
  "application/pdf",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const maxFileSize = 30 * 1024 * 1024;

const parseCohortId = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value === "__none__") {
    return "";
  }

  return value;
};

const getValidatedFile = (value: FormDataEntryValue | null) => {
  if (!(value instanceof File) || value.size === 0) {
    return { error: "파일을 선택해주세요." } as const;
  }

  if (!allowedFileTypes.has(value.type)) {
    return {
      error: "PDF, HWP, DOC, DOCX 파일만 업로드할 수 있습니다.",
    } as const;
  }

  if (value.size > maxFileSize) {
    return {
      error: "파일 크기는 30MB 이하여야 합니다.",
    } as const;
  }

  return { file: value } as const;
};

const revalidateWeeklyTextPaths = () => {
  revalidatePath("/admin/resources/weekly-texts");
  revalidatePath("/resources");
  revalidatePath("/resources/weekly-texts");
};

export async function createWeeklyText(formData: FormData): Promise<WeeklyTextActionState> {
  await requireAdmin();

  const parsed = weeklyTextFormSchema.safeParse({
    title: formData.get("title"),
    cohortId: parseCohortId(formData.get("cohortId")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const validatedFile = getValidatedFile(formData.get("file"));
  if ("error" in validatedFile) {
    return {
      success: false,
      error: validatedFile.error,
    };
  }

  try {
    const safeFileName = validatedFile.file.name.replace(/\s+/g, "-");
    const blob = await put(`weekly-texts/${safeFileName}`, validatedFile.file, {
      access: "public",
    });

    await db.insert(weeklyTexts).values({
      title: parsed.data.title,
      fileUrl: blob.url,
      fileName: validatedFile.file.name,
      cohortId: parsed.data.cohortId || null,
    });

    revalidateWeeklyTextPaths();

    return { success: true };
  } catch (error) {
    console.error("[weekly-texts/create] 생성 오류:", error);

    return {
      success: false,
      error: "주차별 텍스트 저장에 실패했습니다.",
    };
  }
}

export async function deleteWeeklyText(id: string): Promise<WeeklyTextActionState> {
  await requireAdmin();

  const parsedId = weeklyTextIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: parsedId.error.issues[0]?.message ?? "유효하지 않은 주차별 텍스트 ID입니다.",
    };
  }

  try {
    const target = await db.query.weeklyTexts.findFirst({
      where: eq(weeklyTexts.id, parsedId.data),
    });

    if (!target) {
      return {
        success: false,
        error: "주차별 텍스트를 찾을 수 없습니다.",
      };
    }

    await del(target.fileUrl);
    await db.delete(weeklyTexts).where(eq(weeklyTexts.id, parsedId.data));

    revalidateWeeklyTextPaths();

    return { success: true };
  } catch (error) {
    console.error("[weekly-texts/delete] 삭제 오류:", error);

    return {
      success: false,
      error: "주차별 텍스트 삭제에 실패했습니다.",
    };
  }
}
