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
import { deleteBlobIfExists } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { users, weeklyTextImages, weeklyTexts } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import { buildImageAlt } from "@/lib/image-alt";
import { cleanupCreatedBlobs, uploadBlobsForCreate } from "@/lib/create-with-blobs";

export type WeeklyTextActionState = {
  success: boolean;
  error?: string;
};

const weeklyTextIdSchema = z.uuid("유효하지 않은 주차별 텍스트 ID입니다.");
const createRequestIdSchema = z.uuid("유효하지 않은 요청 ID입니다.");

const weeklyTextFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  cohortId: z.union([z.uuid("유효하지 않은 기수 ID입니다."), z.literal("")]).optional(),
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

  // 한글로만 된 파일명은 위 정리 후 ".pdf" 처럼 확장자만 남는다. 이름 부분이 비면 기본 이름을 붙여
  // 저장 경로가 점으로 시작하지 않게 한다 (확장자로 파일 형식을 추정하는 동작을 보존).
  if (sanitized.startsWith(".")) {
    return `weekly-text${sanitized}`;
  }

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

const createWeeklyTextRecord = async (formData: FormData, uploadedById: string): Promise<WeeklyTextActionState> => {
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

  // 업로드 전에 날짜를 확인해야 잘못된 입력으로 미참조 파일이 남지 않습니다.
  const classDateObj = parsed.data.classDate
    ? new Date(`${parsed.data.classDate}T00:00:00`)
    : null;
  if (classDateObj && Number.isNaN(classDateObj.getTime())) {
    return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
  }

  const requestId = createRequestIdSchema.safeParse(formData.get("requestId"));
  if (!requestId.success) {
    return { success: false, error: "페이지를 새로고침한 뒤 다시 제출해주세요." };
  }

  try {
    const id = requestId.data;
    const [alreadyCreated] = await db.select({ id: weeklyTexts.id }).from(weeklyTexts).where(eq(weeklyTexts.id, id)).limit(1);
    if (alreadyCreated) {
      return { success: true };
    }
    const documentFile = validatedFile.file;
    const uploads = [
      ...(documentFile ? [{
        pathname: `weekly-texts/${normalizeFileName(documentFile.name)}`,
        file: documentFile,
      }] : []),
      ...validatedImages.files.map((file, index) => ({
        pathname: `weekly-texts/images/${id}-${index}-${normalizeFileName(file.name)}`,
        file,
      })),
    ];
    const urls = await uploadBlobsForCreate(uploads, uploadedById);
    const imageUrls = urls.slice(documentFile ? 1 : 0);

    try {
      const insertText = db.insert(weeklyTexts).values({
        id,
        title: parsed.data.title,
        fileUrl: documentFile ? urls[0] : "",
        fileName: documentFile?.name ?? null,
        body: parsed.data.body ?? null,
        cohortId: parsed.data.cohortId || null,
        textType: parsed.data.textType ?? null,
        classDate: classDateObj,
      });
      if (imageUrls.length > 0) {
        await db.batch([
          insertText,
          db.insert(weeklyTextImages).values(imageUrls.map((url, index) => ({
            weeklyTextId: id,
            url,
            alt: buildImageAlt(parsed.data.title, index + 1),
            order: index,
          }))),
        ]);
      } else {
        await insertText;
      }
    } catch (error) {
      // 배치 응답이 유실됐어도 실제 글이 남았다면 첨부 파일을 삭제하지 않습니다.
      const [existing] = await db.select({ fileUrl: weeklyTexts.fileUrl }).from(weeklyTexts).where(eq(weeklyTexts.id, id)).limit(1);
      if (!existing) {
        await cleanupCreatedBlobs(urls);
        throw error;
      }
      // 같은 요청이 동시에 도착해 생긴 미참조 업로드만 정리합니다.
      const referencedImages = imageUrls.length > 0
        ? await db.select({ url: weeklyTextImages.url }).from(weeklyTextImages).where(eq(weeklyTextImages.weeklyTextId, id))
        : [];
      const referencedUrls = new Set([existing.fileUrl, ...referencedImages.map((row) => row.url)]);
      await cleanupCreatedBlobs(urls.filter((url) => !referencedUrls.has(url)));
    }

    revalidateWeeklyTextPaths();

    return { success: true };
  } catch (error) {
    logServerError("weekly-texts/create", error, {
      cohortId: parsed.data.cohortId || null,
      textType: parsed.data.textType ?? null,
      hasBody: !!parsed.data.body,
      hasFile: !!validatedFile.file,
      hasImages: validatedImages.files.length > 0,
    });

    return {
      success: false,
      error: "주차별 텍스트 저장에 실패했습니다.",
    };
  }
};

export async function createWeeklyText(formData: FormData): Promise<WeeklyTextActionState> {
  const session = await requireAdmin();

  return createWeeklyTextRecord(formData, session.user.id);
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

  return createWeeklyTextRecord(formData, session.user.id);
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
        { access: "public", addRandomSuffix: true },
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

    // 본문 URL은 소유권을 증명하지 않으므로 본문에서 제거되어도 파일은 보존합니다.

    revalidateWeeklyTextPaths();

    return { success: true };
  } catch (error) {
    logServerError("weekly-texts/update", error, {
      id: parsedId.data,
    });
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
      ...attachedImageRows.map((img) => deleteBlobIfExists(img.url)),
    ]);

    revalidateWeeklyTextPaths();

    return { success: true };
  } catch (error) {
    logServerError("weekly-texts/delete", error, {
      id: parsedId.data,
    });

    return {
      success: false,
      error: "주차별 텍스트 삭제에 실패했습니다.",
    };
  }
}
