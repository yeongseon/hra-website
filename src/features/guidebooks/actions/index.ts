/**
 * 가이드북 서버 액션
 *
 * 역할: 관리자 페이지(/admin/resources/guidebooks)에서 가이드북 파일(PDF/HWP/DOC 등)의
 *       업로드(생성)와 삭제를 처리한다. 파일은 Vercel Blob에, 메타는 Postgres에 저장한다.
 *
 * 사용 위치:
 *   - src/app/(admin)/admin/resources/guidebooks/_components/guidebook-form.tsx (생성 폼)
 *   - src/app/(admin)/admin/resources/guidebooks/_components/guidebook-row-actions.tsx (삭제)
 *
 * 보안:
 *   - 모든 진입점에서 requireAdmin()으로 관리자 권한 확인
 *   - 파일 MIME 타입 화이트리스트 + 30MB 크기 제한
 *   - 파일명 sanitize (영숫자/.-_만 허용) — 경로 분리(/) 차단
 */
"use server";

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteBlobIfExists } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { guidebooks } from "@/lib/db/schema";

export type GuidebookActionState = {
  success: boolean;
  error?: string;
};

const guidebookIdSchema = z.uuid("유효하지 않은 가이드북 ID입니다.");

const guidebookFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
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

  return sanitized || "guidebook";
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

const revalidateGuidebookPaths = () => {
  revalidatePath("/admin/resources/guidebooks");
  revalidatePath("/resources");
};

export async function createGuidebook(formData: FormData): Promise<GuidebookActionState> {
  await requireAdmin();

  const parsed = guidebookFormSchema.safeParse({
    title: formData.get("title"),
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
    const blob = await put(`guidebooks/${safeFileName}`, validatedFile.file, {
      access: "public",
    });

    await db.insert(guidebooks).values({
      title: parsed.data.title,
      fileUrl: blob.url,
      fileName: validatedFile.file.name,
    });

    revalidateGuidebookPaths();

    return { success: true };
  } catch (error) {
    console.error("[guidebooks/create] 생성 오류:", error);

    return {
      success: false,
      error: "가이드북 저장에 실패했습니다.",
    };
  }
}

export async function deleteGuidebook(id: string): Promise<GuidebookActionState> {
  await requireAdmin();

  const parsedId = guidebookIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: parsedId.error.issues[0]?.message ?? "유효하지 않은 가이드북 ID입니다.",
    };
  }

  try {
    const target = await db.query.guidebooks.findFirst({
      where: eq(guidebooks.id, parsedId.data),
    });

    if (!target) {
      return {
        success: false,
        error: "가이드북을 찾을 수 없습니다.",
      };
    }

    await deleteBlobIfExists(target.fileUrl);
    await db.delete(guidebooks).where(eq(guidebooks.id, parsedId.data));

    revalidateGuidebookPaths();

    return { success: true };
  } catch (error) {
    console.error("[guidebooks/delete] 삭제 오류:", error);

    return {
      success: false,
      error: "가이드북 삭제에 실패했습니다.",
    };
  }
}
