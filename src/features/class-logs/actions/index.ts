"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { classLogs } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/admin";

const classLogIdSchema = z.uuid();

const classLogFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300),
  content: z.string().trim().min(1, "내용을 입력해주세요."),
  classDate: z.string().trim().min(1, "수업 날짜를 입력해주세요."),
  cohortId: z.union([z.uuid(), z.literal("")]).optional(),
});

type ClassLogActionState = {
  success: boolean;
  error?: string;
};

const revalidateClassLogPaths = () => {
  revalidatePath("/admin/class-logs");
  revalidatePath("/class-logs");
};

const toClassDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

const parseCohortId = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value === "__none__") {
    return "";
  }

  return value;
};

export async function createClassLog(formData: FormData): Promise<ClassLogActionState> {
  const session = await requireAdmin();

  const parsed = classLogFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    classDate: formData.get("classDate"),
    cohortId: parseCohortId(formData.get("cohortId")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const classDate = toClassDate(parsed.data.classDate);
  if (!classDate) {
    return {
      success: false,
      error: "유효한 수업 날짜를 입력해주세요.",
    };
  }

  try {
    await db.insert(classLogs).values({
      title: parsed.data.title,
      content: parsed.data.content,
      classDate,
      cohortId: parsed.data.cohortId || null,
      authorId: session.user.id,
    });

    revalidateClassLogPaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "수업일지 생성에 실패했습니다.",
    };
  }
}

export async function updateClassLog(
  id: string,
  formData: FormData
): Promise<ClassLogActionState> {
  await requireAdmin();

  const parsedId = classLogIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 수업일지 ID입니다.",
    };
  }

  const parsed = classLogFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    classDate: formData.get("classDate"),
    cohortId: parseCohortId(formData.get("cohortId")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const classDate = toClassDate(parsed.data.classDate);
  if (!classDate) {
    return {
      success: false,
      error: "유효한 수업 날짜를 입력해주세요.",
    };
  }

  try {
    await db
      .update(classLogs)
      .set({
        title: parsed.data.title,
        content: parsed.data.content,
        classDate,
        cohortId: parsed.data.cohortId || null,
      })
      .where(eq(classLogs.id, parsedId.data));

    revalidateClassLogPaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "수업일지 수정에 실패했습니다.",
    };
  }
}

export async function deleteClassLog(id: string): Promise<ClassLogActionState> {
  await requireAdmin();

  const parsedId = classLogIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 수업일지 ID입니다.",
    };
  }

  try {
    await db.delete(classLogs).where(eq(classLogs.id, parsedId.data));

    revalidateClassLogPaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "수업일지 삭제에 실패했습니다.",
    };
  }
}
