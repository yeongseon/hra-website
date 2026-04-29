/**
 * 주차별 텍스트 서버 액션
 *
 * 역할: 관리자 페이지(/admin/resources/weekly-texts)에서 주차별 텍스트 자료의
 *       업로드(생성)와 삭제를 처리한다. 파일은 Vercel Blob에, 메타는 Postgres에 저장한다.
 *
 * 사용 위치:
 *   - src/app/(admin)/admin/resources/weekly-texts/_components/weekly-text-form.tsx (생성 폼)
 *   - src/app/(admin)/admin/resources/weekly-texts/_components/weekly-text-row-actions.tsx (삭제)
 *
 * 보안:
 *   - 모든 진입점에서 requireAdmin()으로 관리자 권한 확인
 *   - 파일 MIME 타입 화이트리스트 + 30MB 크기 제한
 *   - 파일명 sanitize (영숫자/.-_만 허용) — 경로 분리(/) 차단
 */
"use server";

import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users, weeklyTexts } from "@/lib/db/schema";

export type WeeklyTextActionState = {
  success: boolean;
  error?: string;
};

const weeklyTextIdSchema = z.uuid("유효하지 않은 주차별 텍스트 ID입니다.");

/** 주차별 텍스트 분류 값 (DB: varchar 20, nullable) */
const WEEKLY_TEXT_TYPE_VALUES = ["고전명작", "경영서", "기업실무"] as const;

const weeklyTextFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  cohortId: z.union([z.uuid(), z.literal("")]).optional(),
  // "__none__" 또는 빈 문자열이면 null로 변환 (미분류)
  textType: z
    .enum(WEEKLY_TEXT_TYPE_VALUES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

const allowedFileTypes = new Set([
  "application/pdf",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const maxFileSize = 30 * 1024 * 1024;

const normalizeFileName = (fileName: string) => {
  const trimmed = fileName.trim();
  const sanitized = trimmed
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]/g, "");

  return sanitized || "weekly-text";
};

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

const createWeeklyTextRecord = async (formData: FormData): Promise<WeeklyTextActionState> => {
  const rawTextType = formData.get("textType");
  const parsedTextType =
    typeof rawTextType === "string" && rawTextType !== "__none__" && rawTextType !== ""
      ? rawTextType
      : null;

  const parsed = weeklyTextFormSchema.safeParse({
    title: formData.get("title"),
    cohortId: parseCohortId(formData.get("cohortId")),
    textType: parsedTextType,
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
    const safeFileName = normalizeFileName(validatedFile.file.name);
    const blob = await put(`weekly-texts/${safeFileName}`, validatedFile.file, {
      access: "public",
    });

    await db.insert(weeklyTexts).values({
      title: parsed.data.title,
      fileUrl: blob.url,
      fileName: validatedFile.file.name,
      cohortId: parsed.data.cohortId || null,
      textType: parsed.data.textType ?? null,
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
};

export async function createWeeklyText(formData: FormData): Promise<WeeklyTextActionState> {
  await requireAdmin();

  return createWeeklyTextRecord(formData);
}

export async function createWeeklyTextAsMember(
  formData: FormData,
): Promise<WeeklyTextActionState> {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user) {
    return {
      success: false,
      error: "로그인 후 이용해주세요.",
    };
  }

  // ADMIN, FACULTY, MEMBER만 업로드 가능 (PENDING 불가)
  if (role !== "ADMIN" && role !== "FACULTY" && role !== "MEMBER") {
    return {
      success: false,
      error: "승인된 회원만 업로드할 수 있습니다.",
    };
  }

  // MEMBER는 자신의 기수에만 업로드 가능 — 서버 사이드 검증
  if (role === "MEMBER") {
    const cohortIdValue = formData.get("cohortId");
    const submittedCohortId =
      typeof cohortIdValue === "string" && cohortIdValue !== "__none__" ? cohortIdValue : null;

    if (submittedCohortId) {
      const [userRow] = await db
        .select({ cohortId: users.cohortId })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

      if (userRow?.cohortId !== submittedCohortId) {
        return {
          success: false,
          error: "자신의 기수에만 업로드할 수 있습니다.",
        };
      }
    }
  }

  return createWeeklyTextRecord(formData);
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
