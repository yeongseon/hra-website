/**
 * 지원서 양식 관리 서버 액션
 */
"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { applicationForms } from "@/lib/db/schema";

const formSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(255, "제목은 255자 이하여야 합니다."),
  description: z.string().trim().optional(),
  cohortId: z.string().uuid("기수를 선택해주세요.").optional().nullable(),
  isPublished: z.boolean().default(false),
});

export type FormActionState = {
  success: boolean;
  message: string;
  id?: string;
};

/**
 * 새 지원서 양식 생성
 */
export async function createForm(formData: FormData): Promise<FormActionState> {
  await requireAdmin();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  // UI Select 컴포넌트는 "기수 지정 안 함" 선택 시 "none" 문자열을 전송합니다.
  // 서버 측에서는 빈 값과 "none"을 모두 null로 정규화하여 Zod UUID 검증을 통과시킵니다.
  const cohortIdRaw = formData.get("cohortId") as string | null;
  const cohortId = !cohortIdRaw || cohortIdRaw === "none" ? null : cohortIdRaw;
  const isPublished = formData.get("isPublished") === "true";

  const parsed = formSchema.safeParse({
    title,
    description,
    cohortId,
    isPublished,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    const [newForm] = await db
      .insert(applicationForms)
      .values({
        title: parsed.data.title,
        description: parsed.data.description,
        cohortId: parsed.data.cohortId,
        isPublished: parsed.data.isPublished,
      })
      .returning({ id: applicationForms.id });

    revalidatePath("/admin/application-forms");
    return {
      success: true,
      message: "양식이 생성되었습니다.",
      id: newForm.id,
    };
  } catch (error) {
    console.error("지원서 양식 생성 오류:", error);
    return {
      success: false,
      message: "양식 생성 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 지원서 양식 마스터 정보 수정
 */
export async function updateForm(id: string, formData: FormData): Promise<FormActionState> {
  await requireAdmin();

  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  // createForm 과 동일한 사유로 "none" 도 null 로 정규화합니다.
  const cohortIdRaw = formData.get("cohortId") as string | null;
  const cohortId = !cohortIdRaw || cohortIdRaw === "none" ? null : cohortIdRaw;
  const isPublished = formData.get("isPublished") === "true";

  const parsed = formSchema.safeParse({
    title,
    description,
    cohortId,
    isPublished,
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0].message,
    };
  }

  try {
    await db
      .update(applicationForms)
      .set({
        title: parsed.data.title,
        description: parsed.data.description,
        cohortId: parsed.data.cohortId,
        isPublished: parsed.data.isPublished,
        updatedAt: new Date(),
      })
      .where(eq(applicationForms.id, id));

    revalidatePath("/admin/application-forms");
    revalidatePath(`/admin/application-forms/${id}`);
    return {
      success: true,
      message: "양식이 수정되었습니다.",
    };
  } catch (error) {
    console.error("지원서 양식 수정 오류:", error);
    return {
      success: false,
      message: "양식 수정 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 공개 상태 전환
 */
export async function toggleFormPublishStatus(id: string, isPublished: boolean): Promise<FormActionState> {
  await requireAdmin();

  try {
    await db
      .update(applicationForms)
      .set({
        isPublished,
        updatedAt: new Date(),
      })
      .where(eq(applicationForms.id, id));

    revalidatePath("/admin/application-forms");
    return {
      success: true,
      message: isPublished ? "양식이 공개되었습니다." : "양식이 비공개되었습니다.",
    };
  } catch (error) {
    console.error("공개 상태 전환 오류:", error);
    return {
      success: false,
      message: "상태 변경 중 오류가 발생했습니다.",
    };
  }
}

/**
 * 지원서 양식 삭제
 */
export async function deleteForm(id: string): Promise<FormActionState> {
  await requireAdmin();

  try {
    await db.delete(applicationForms).where(eq(applicationForms.id, id));

    revalidatePath("/admin/application-forms");
    return {
      success: true,
      message: "양식이 삭제되었습니다.",
    };
  } catch (error) {
    console.error("지원서 양식 삭제 오류:", error);
    return {
      success: false,
      message: "양식 삭제 중 오류가 발생했습니다.",
    };
  }
}
