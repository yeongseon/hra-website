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

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { WEEKLY_TEXT_TYPE_VALUES } from "@/features/weekly-texts/constants";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { deleteMarkdownBlobImages, deleteBlobIfExists } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { users, weeklyTextImages, weeklyTexts } from "@/lib/db/schema";

export type WeeklyTextActionState = {
  success: boolean;
  error?: string;
};

const weeklyTextIdSchema = z.uuid("유효하지 않은 주차별 텍스트 ID입니다.");

const weeklyTextFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  cohortId: z.union([z.uuid(), z.literal("")]).optional(),
  textType: z
    .enum(WEEKLY_TEXT_TYPE_VALUES)
    .nullable()
    .optional()
    .transform((v) => v ?? null),
  classDate: z.string().optional().nullable(),
  body: z
    .string()
    .optional()
    .nullable()
    .transform((value) => {
      if (typeof value !== "string") {
        return null;
      }

      return value.trim().length > 0 ? value : null;
    }),
});

const allowedFileTypes = new Set([
  "application/pdf",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const maxFileSize = 30 * 1024 * 1024;

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const maxImageSize = 10 * 1024 * 1024;

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
    return { file: null } as const;
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

const getValidatedImageFiles = (formData: FormData) => {
  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);

  for (const file of files) {
    if (!allowedImageTypes.has(file.type)) {
      return {
        error: "사진은 JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다.",
      } as const;
    }

    if (file.size > maxImageSize) {
      return {
        error: "사진 파일은 10MB 이하여야 합니다.",
      } as const;
    }
  }

  return { files } as const;
};

const revalidateWeeklyTextPaths = () => {
  revalidatePath("/admin/resources/weekly-texts");
  revalidatePath("/resources");
  revalidatePath("/resources/weekly-texts");
};

const uploadWeeklyTextImages = async (weeklyTextId: string, title: string, files: File[]) => {
  if (files.length === 0) {
    return [];
  }

  const uploadedImages = await Promise.all(
    files.map(async (file, index) => {
      const blob = await put(`weekly-texts/images/${Date.now()}-${index}-${normalizeFileName(file.name)}`, file, {
        access: "public",
      });

      return {
        weeklyTextId,
        url: blob.url,
        alt: `${title} 사진 ${index + 1}`,
        order: index,
      };
    }),
  );

  await db.insert(weeklyTextImages).values(uploadedImages);

  return uploadedImages;
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
    classDate: formData.get("classDate"),
    body: formData.get("body"),
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

  const validatedImages = getValidatedImageFiles(formData);
  if ("error" in validatedImages) {
    return {
      success: false,
      error: validatedImages.error,
    };
  }

  if (!validatedFile.file && !parsed.data.body) {
    return {
      success: false,
      error: "파일을 업로드하거나 마크다운을 작성해주세요.",
    };
  }

  try {
    const blob = validatedFile.file
      ? await put(`weekly-texts/${normalizeFileName(validatedFile.file.name)}`, validatedFile.file, {
          access: "public",
        })
      : null;

    const classDateObj = parsed.data.classDate
      ? new Date(`${parsed.data.classDate}T00:00:00`)
      : null;

    if (classDateObj && Number.isNaN(classDateObj.getTime())) {
      return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
    }

    const [createdWeeklyText] = await db.insert(weeklyTexts).values({
      title: parsed.data.title,
      fileUrl: blob?.url ?? "",
      fileName: validatedFile.file?.name ?? null,
      body: parsed.data.body ?? null,
      cohortId: parsed.data.cohortId || null,
      textType: parsed.data.textType ?? null,
      classDate: classDateObj,
    }).returning({ id: weeklyTexts.id });

    if (!createdWeeklyText) {
      return {
        success: false,
        error: "주차별 텍스트 저장에 실패했습니다.",
      };
    }

    await uploadWeeklyTextImages(createdWeeklyText.id, parsed.data.title, validatedImages.files);

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

  // MEMBER는 DB에서 본인 cohortId를 직접 조회해 강제 적용 (폼값 신뢰 금지)
  if (role === "MEMBER") {
    const [userRow] = await db
      .select({ cohortId: users.cohortId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!userRow?.cohortId) {
      return { success: false, error: "기수가 배정되지 않은 회원은 업로드할 수 없습니다." };
    }

    formData.set("cohortId", userRow.cohortId);
  }

  return createWeeklyTextRecord(formData);
}

export async function updateWeeklyText(id: string, formData: FormData): Promise<WeeklyTextActionState> {
  await requireAdmin();

  const parsedId = weeklyTextIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: "유효하지 않은 주차별 텍스트 ID입니다." };
  }

  const rawTextType = formData.get("textType");
  const parsedTextType =
    typeof rawTextType === "string" && rawTextType !== "__none__" && rawTextType !== ""
      ? rawTextType
      : null;

  const parsed = weeklyTextFormSchema.safeParse({
    title: formData.get("title"),
    cohortId: parseCohortId(formData.get("cohortId")),
    textType: parsedTextType,
    classDate: formData.get("classDate"),
    body: formData.get("body"),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." };
  }

  try {
    const existing = await db.query.weeklyTexts.findFirst({
      where: eq(weeklyTexts.id, parsedId.data),
    });

    if (!existing) {
      return { success: false, error: "주차별 텍스트를 찾을 수 없습니다." };
    }

    // 새 파일이 첨부된 경우에만 기존 파일을 교체
    const validatedFile = getValidatedFile(formData.get("file"));
    if ("error" in validatedFile) {
      return { success: false, error: validatedFile.error };
    }

    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;
    let uploadedNewBlobUrl: string | null = null;

    if (validatedFile.file) {
      // 순서 원칙: 새 blob 업로드 → DB update → 옛 blob cleanup (best-effort).
      // 옛 blob 을 먼저 지우면 이후 단계 실패 시 되돌릴 수 없다.
      const blob = await put(
        `weekly-texts/${normalizeFileName(validatedFile.file.name)}`,
        validatedFile.file,
        { access: "public" },
      );
      uploadedNewBlobUrl = blob.url;
      fileUrl = blob.url;
      fileName = validatedFile.file.name;
    }

    const classDateObj = parsed.data.classDate
      ? new Date(`${parsed.data.classDate}T00:00:00`)
      : null;

    if (classDateObj && Number.isNaN(classDateObj.getTime())) {
      // 업로드 성공 후 검증 실패 → 새 blob 은 참조되지 않으므로 되지운다.
      if (uploadedNewBlobUrl) {
        await deleteBlobIfExists(uploadedNewBlobUrl);
      }
      return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
    }

    try {
      await db
        .update(weeklyTexts)
        .set({
          title: parsed.data.title,
          cohortId: parsed.data.cohortId || null,
          textType: parsed.data.textType ?? null,
          classDate: classDateObj,
          body: parsed.data.body ?? existing.body,
          fileUrl,
          fileName,
        })
        .where(eq(weeklyTexts.id, parsedId.data));
    } catch (dbError) {
      // 업로드 성공 후 DB 실패 → 새 blob 은 참조되지 않으므로 되지운다.
      if (uploadedNewBlobUrl) {
        await deleteBlobIfExists(uploadedNewBlobUrl);
      }
      throw dbError;
    }

    // DB update 성공 → 옛 blob cleanup (best-effort).
    // uploadedNewBlobUrl 이 있을 때만 = 실제로 교체가 일어난 경우만 삭제 대상.
    if (uploadedNewBlobUrl && existing.fileUrl && existing.fileUrl !== uploadedNewBlobUrl) {
      await deleteBlobIfExists(existing.fileUrl);
    }

    revalidateWeeklyTextPaths();

    return { success: true };
  } catch (error) {
    console.error("[weekly-texts/update] 수정 오류:", error);
    return { success: false, error: "주차별 텍스트 수정에 실패했습니다." };
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
    // 삭제 전 스냅샷: 파일 URL + 마크다운 본문 + 첨부 이미지 URL.
    // DB 먼저 지우면 참조 정보가 사라져 blob cleanup 불가.
    const target = await db.query.weeklyTexts.findFirst({
      where: eq(weeklyTexts.id, parsedId.data),
    });

    if (!target) {
      return {
        success: false,
        error: "주차별 텍스트를 찾을 수 없습니다.",
      };
    }

    const attachedImageRows = await db
      .select({ url: weeklyTextImages.url })
      .from(weeklyTextImages)
      .where(eq(weeklyTextImages.weeklyTextId, parsedId.data));

    // 순서 원칙: DB 먼저 삭제 → blob cleanup (best-effort).
    // 역순이면 DB 삭제 실패 시 깨진 URL 참조가 남는다.
    // weeklyTextImages 는 onDelete: "cascade" 로 자동 삭제된다.
    await db.delete(weeklyTexts).where(eq(weeklyTexts.id, parsedId.data));

    // cleanup 실패는 로그만 남고 액션은 성공으로 끝난다 (orphan blob 만 남을 뿐 사용자 영향 없음).
    await Promise.all([
      deleteBlobIfExists(target.fileUrl),
      deleteMarkdownBlobImages(target.body ?? ""),
      ...attachedImageRows.map((img) => deleteBlobIfExists(img.url)),
    ]);

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
