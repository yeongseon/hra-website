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
 *   - 파일 확장자·시작 바이트·선언 MIME 검사 + 30MB 크기 제한
 *   - 파일명 sanitize (영숫자/.-_만 허용) — 경로 분리(/) 차단
 */
"use server";

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
import { validateDocumentUpload, validateImageUpload } from "@/lib/upload-file-validation";
import { validateResourceUploadReference } from "@/lib/resource-upload-server";
import { validateWeeklyTextImageReference } from "@/lib/weekly-text-image-upload";
import { resourceBlobAccess } from "@/lib/resource-download";
import { uploadWithOwnedIntent } from "@/lib/server-upload-intent";
import { findOwnedBlobUrls } from "@/lib/owned-blob";

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

const maxFileSize = 30 * 1024 * 1024;

const maxImageSize = 10 * 1024 * 1024;

// 직접 업로드 URL은 원장이 현재 참조를 확인한 후 정리합니다. 같은 URL이 다른
// 콘텐츠에 재사용됐거나 DB 응답이 불확실할 때 즉시 삭제하면 정상 파일을 잃을 수 있습니다.
const isDirectWeeklyUpload = (url: string) => resourceBlobAccess(url) !== null &&
  (new URL(url).pathname.startsWith("/resource-uploads/weekly-texts/") ||
   new URL(url).pathname.startsWith("/weekly-text-images/"));

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

const getValidatedFile = async (value: FormDataEntryValue | null) => {
  if (!(value instanceof File) || value.size === 0) {
    return { file: null, contentType: null } as const;
  }

  if (value.size > maxFileSize) {
    return { error: "파일 크기는 30MB 이하여야 합니다." } as const;
  }

  const contentType = await validateDocumentUpload(value);
  if (!contentType) {
    return {
      error: "PDF, HWP, DOC, DOCX 파일만 업로드할 수 있습니다.",
    } as const;
  }

  return { file: value, contentType } as const;
};

const getValidatedImageFiles = async (formData: FormData) => {
  const files = formData
    .getAll("images")
    .filter((value): value is File => value instanceof File && value.size > 0);

  const contentTypes: string[] = [];
  for (const file of files) {
    if (file.size > maxImageSize) {
      return { error: "사진 파일은 10MB 이하여야 합니다." } as const;
    }
    const contentType = await validateImageUpload(file);
    if (!contentType) {
      return {
        error: "사진은 JPG, PNG, WEBP, GIF 형식만 업로드할 수 있습니다.",
      } as const;
    }
    contentTypes.push(contentType);
  }

  return { files, contentTypes } as const;
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

  const validatedFile = await getValidatedFile(formData.get("file"));
  if ("error" in validatedFile) {
    return {
      success: false,
      error: validatedFile.error,
    };
  }

  const directUrl = formData.get("uploadedFileUrl");
  const directName = formData.get("uploadedFileName");
  if (validatedFile.file && directUrl) return { success: false, error: "파일 정보를 확인할 수 없습니다." };
  const directFile = typeof directUrl === "string" && typeof directName === "string"
    ? await validateResourceUploadReference("weekly-texts", uploadedById, directUrl, directName)
    : null;
  if (directUrl && (!directFile || "error" in directFile)) {
    return { success: false, error: "업로드한 파일을 확인할 수 없습니다." };
  }

  const validatedImages = await getValidatedImageFiles(formData);
  if ("error" in validatedImages) {
    return {
      success: false,
      error: validatedImages.error,
    };
  }

  if (!validatedFile.file && !directFile && !parsed.data.body) {
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

  const rawImageUrls = formData.get("uploadedImageUrls");
  let directImageUrls: string[] = [];
  if (rawImageUrls !== null) {
    if (validatedImages.files.length > 0 || typeof rawImageUrls !== "string") {
      return { success: false, error: "사진 정보를 확인할 수 없습니다." };
    }
    try {
      const parsedUrls = z.array(z.url()).min(1).max(100).safeParse(JSON.parse(rawImageUrls));
      if (!parsedUrls.success || new Set(parsedUrls.data).size !== parsedUrls.data.length) {
        return { success: false, error: "사진 정보를 확인할 수 없습니다." };
      }
      directImageUrls = parsedUrls.data;
    } catch {
      return { success: false, error: "사진 정보를 확인할 수 없습니다." };
    }
    const checks = await Promise.all(directImageUrls.map((url) =>
      validateWeeklyTextImageReference(requestId.data, uploadedById, url)));
    if (checks.some((valid) => !valid)) return { success: false, error: "업로드한 사진을 확인할 수 없습니다." };
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
        contentType: validatedFile.contentType,
      }] : []),
      ...validatedImages.files.map((file, index) => ({
        pathname: `weekly-texts/images/${id}-${index}-${normalizeFileName(file.name)}`,
        file,
        contentType: validatedImages.contentTypes[index],
      })),
    ];
    const urls = await uploadBlobsForCreate(uploads, uploadedById, true);
    const imageUrls = [...directImageUrls, ...urls.slice(documentFile ? 1 : 0)];

    try {
      const insertText = db.insert(weeklyTexts).values({
        id,
        title: parsed.data.title,
        fileUrl: directFile && "url" in directFile ? directFile.url : documentFile ? urls[0] : "",
        fileName: directFile && "fileName" in directFile ? directFile.fileName : documentFile?.name ?? null,
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
      hasFile: !!validatedFile.file || !!directFile,
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
  const session = await requireAdmin();

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
    const validatedFile = await getValidatedFile(formData.get("file"));
    if ("error" in validatedFile) {
      return { success: false, error: validatedFile.error };
    }

    const directUrl = formData.get("uploadedFileUrl");
    const directName = formData.get("uploadedFileName");
    if (validatedFile.file && directUrl) return { success: false, error: "파일 정보를 확인할 수 없습니다." };
    const directFile = typeof directUrl === "string" && typeof directName === "string"
      ? await validateResourceUploadReference("weekly-texts", session.user.id, directUrl, directName)
      : null;
    if (directUrl && (!directFile || "error" in directFile)) {
      return { success: false, error: "업로드한 파일을 확인할 수 없습니다." };
    }

    // 파일을 만들기 전에 날짜 검증을 끝내 불필요한 예약·객체 생성을 피합니다.
    const classDateObj = parsed.data.classDate ? new Date(`${parsed.data.classDate}T00:00:00`) : null;
    if (classDateObj && Number.isNaN(classDateObj.getTime())) {
      return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
    }

    let fileUrl = existing.fileUrl;
    let fileName = existing.fileName;

    if (directFile && "url" in directFile) {
      fileUrl = directFile.url;
      fileName = directFile.fileName;
    }

    if (validatedFile.file) {
      // UUID URL을 먼저 예약해 업로드 중단·응답 유실 이후에도 기존 원장으로 추적합니다.
      fileUrl = await uploadWithOwnedIntent({
        namespace: "weekly-texts", extension: validatedFile.file.name.split(".").pop()?.toLowerCase() ?? "",
        body: validatedFile.file, contentType: validatedFile.contentType,
        uploadedById: session.user.id, protectedResource: true,
      });
      fileName = validatedFile.file.name;
    }

    // DB 응답만 유실되어 이미 참조 중일 수 있으므로 실패해도 새 객체를 즉시 삭제하지 않습니다.
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

    // 직접 업로드의 기존 보존 규칙에 더해 원장 등록된 서버·레거시 객체도 유지보수 GC에 맡깁니다.
    if (fileUrl !== existing.fileUrl && existing.fileUrl && !isDirectWeeklyUpload(existing.fileUrl)) {
      const ownedUrls = await findOwnedBlobUrls([existing.fileUrl]);
      if (ownedUrls && !ownedUrls.has(existing.fileUrl)) await deleteBlobIfExists(existing.fileUrl);
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

    // 경로만으로 등록 여부를 추정하지 않습니다. 원장 조회 실패 시에도 삭제 전체를 건너뜁니다.
    const legacyUrls = [target.fileUrl, ...attachedImageRows.map((img) => img.url)]
      .filter((url) => url && !isDirectWeeklyUpload(url));
    const ownedUrls = await findOwnedBlobUrls(legacyUrls);
    if (ownedUrls) await cleanupCreatedBlobs(legacyUrls.filter((url) => !ownedUrls.has(url)));

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
