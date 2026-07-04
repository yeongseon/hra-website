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
import { logServerError } from "@/lib/errors";

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

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return { success: false, error: "서버 설정 오류: BLOB_READ_WRITE_TOKEN이 없습니다." };
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
    logServerError("guidebooks/create", error, {
      hasFile: true,
    });

    // 사용자 응답에 raw error.message 를 노출하지 않는다. Drizzle NeonHttpError·Blob 오류는
    // SQL query text·PII·인프라 세부를 포함할 수 있어 관리자 UI 로 반환되면 정보 유출이 된다.
    // 원본 예외는 위의 logServerError 로 서버 로그에만 기록되며, 사용자에게는 재시도 안내만 반환한다.
    return {
      success: false,
      error: "가이드북 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }
}

/**
 * 기존 가이드북 수정 — 제목 변경, 파일 교체(선택)
 * 새 파일이 없으면 기존 파일을 그대로 유지한다.
 */
export async function updateGuidebook(id: string, formData: FormData): Promise<GuidebookActionState> {
  await requireAdmin();

  const parsedId = guidebookIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: parsedId.error.issues[0]?.message ?? "유효하지 않은 ID입니다." };
  }

  const parsed = guidebookFormSchema.safeParse({
    title: formData.get("title"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." };
  }

  try {
    const target = await db.query.guidebooks.findFirst({
      where: eq(guidebooks.id, parsedId.data),
    });
    if (!target) {
      return { success: false, error: "가이드북을 찾을 수 없습니다." };
    }

    const fileEntry = formData.get("file");
    const hasNewFile = fileEntry instanceof File && fileEntry.size > 0;

    if (hasNewFile) {
      // 새 파일 검증 및 업로드 후 기존 파일 제거
      const validatedFile = getValidatedFile(fileEntry);
      if ("error" in validatedFile) {
        return { success: false, error: validatedFile.error };
      }

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return { success: false, error: "서버 설정 오류: BLOB_READ_WRITE_TOKEN이 없습니다." };
      }

      const safeFileName = normalizeFileName(validatedFile.file.name);
      const blob = await put(`guidebooks/${safeFileName}`, validatedFile.file, { access: "public" });

      await db
        .update(guidebooks)
        .set({ title: parsed.data.title, fileUrl: blob.url, fileName: validatedFile.file.name })
        .where(eq(guidebooks.id, parsedId.data));

      await deleteBlobIfExists(target.fileUrl);
    } else {
      // 파일 교체 없이 제목만 수정
      await db
        .update(guidebooks)
        .set({ title: parsed.data.title })
        .where(eq(guidebooks.id, parsedId.data));
    }

    revalidateGuidebookPaths();
    return { success: true };
  } catch (error) {
    logServerError("guidebooks/update", error, {
      id: parsedId.data,
      hasNewFile: formData.get("file") instanceof File,
    });
    // createGuidebook 과 동일 정책 — raw error.message 를 사용자에게 노출하지 않는다.
    return { success: false, error: "가이드북 수정에 실패했습니다. 잠시 후 다시 시도해주세요." };
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
    logServerError("guidebooks/delete", error, {
      id: parsedId.data,
    });

    return {
      success: false,
      error: "가이드북 삭제에 실패했습니다.",
    };
  }
}
