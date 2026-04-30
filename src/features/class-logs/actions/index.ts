/**
 * ==========================================
 * 수업일지 서버 액션 (Server Actions)
 * ==========================================
 *
 * 이 파일은 수업일지의 CRUD(생성, 읽기, 수정, 삭제) 기능을
 * 서버에서 처리하는 함수들을 모아놓은 파일입니다.
 *
 * 역할:
 * - 수업일지 데이터를 생성, 수정, 삭제할 때 서버에서 실행됨
 * - 데이터 유효성 검사 (검증)
 * - 데이터베이스에 저장
 * - 캐시 갱신 (화면에 최신 데이터 표시)
 *
 * 사용되는 주요 도구들:
 * - drizzle-orm: 데이터베이스에 데이터를 저장/수정/삭제하는 도구
 * - Zod (z): 입력 데이터가 올바른 형식인지 검사하는 도구
 * - revalidatePath: 특정 페이지의 캐시를 새로고침하는 함수
 */

"use server";

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { deleteMarkdownBlobImages, deleteBlobIfExists } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { classLogImages, classLogs } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/admin";

/**
 * 수업일지 ID 유효성 검사 스키마
 * - UUID 형식(예: "550e8400-e29b-41d4-a716-446655440000")이어야 함
 */
const classLogIdSchema = z.uuid();

/**
 * 수업일지 작성/수정 시 입력 데이터 검증 규칙
 * 
 * 각 필드 설명:
 * - title: 수업일지 제목 (최소 1글자, 최대 300글자)
 * - content: 수업일지 내용 (최소 1글자, 제한 없음)
 * - classDate: 수업이 있던 날짜 (예: "2025-03-24")
 * - cohortId: 어느 반에 해당하는지 (선택사항, 없어도 됨)
 */
const classLogFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300),
  content: z.string().trim().min(1, "내용을 입력해주세요."),
  classDate: z.string().trim().min(1, "수업 날짜를 입력해주세요."),
  cohortId: z.union([z.uuid(), z.literal("")]).optional(),
});

/**
 * 서버 액션 실행 후 결과를 나타내는 타입
 * - success: 성공했는지 여부 (true/false)
 * - error: 실패했을 때의 에러 메시지 (선택사항)
 */
type ClassLogActionState = {
  success: boolean;
  error?: string;
};

const allowedImageTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const maxImageSize = 10 * 1024 * 1024;

/**
 * 수업일지 관련 페이지들의 캐시를 새로고침하는 헬퍼 함수
 *
 * 역할: 수업일지를 생성, 수정, 삭제할 때마다 호출되어
 *      관리자 페이지와 공개 페이지의 데이터를 최신으로 유지
 * 
 * 예시: 새 수업일지를 만들면 → 이 함수가 실행 → 
 *      페이지를 방문한 사용자들이 새로운 내용을 볼 수 있음
 */
const revalidateClassLogPaths = () => {
  revalidatePath("/admin/resources");
  revalidatePath("/resources");
};

/**
 * 문자열을 날짜 객체로 변환하는 헬퍼 함수
 * 
 * 입력: "2025-03-24" 같은 날짜 문자열
 * 출력: JavaScript Date 객체 (또는 잘못된 형식이면 null)
 * 
 * 예시:
 * - toClassDate("2025-03-24") → Date 객체
 * - toClassDate("invalid") → null
 */
const toClassDate = (value: string) => {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
};

/**
 * 폼에서 받은 반(cohort) ID를 처리하는 헬퍼 함수
 * 
 * 역할: 사용자가 "반 없음"을 선택했으면 빈 문자열("")으로 변환
 *      그 외에는 그대로 반의 ID를 반환
 * 
 * 예시:
 * - parseCohortId("550e8400-...") → "550e8400-..." (반 ID)
 * - parseCohortId("__none__") → "" (반 없음)
 */
const parseCohortId = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string" || value === "__none__") {
    return "";
  }

  return value;
};

const normalizeFileName = (fileName: string) => {
  const trimmed = fileName.trim();
  const sanitized = trimmed.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");

  return sanitized || "class-log-image";
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

const uploadClassLogImages = async (classLogId: string, title: string, files: File[]) => {
  if (files.length === 0) {
    return [];
  }

  const uploadedImages = await Promise.all(
    files.map(async (file, index) => {
      const blob = await put(`class-logs/${Date.now()}-${index}-${normalizeFileName(file.name)}`, file, {
        access: "public",
      });

      return {
        classLogId,
        url: blob.url,
        alt: `${title} 사진 ${index + 1}`,
        order: index,
      };
    }),
  );

  await db.insert(classLogImages).values(uploadedImages);

  return uploadedImages;
};

const deleteClassLogImagesFromBlob = async (classLogId: string) => {
  const existingImages = await db
    .select({ url: classLogImages.url })
    .from(classLogImages)
    .where(eq(classLogImages.classLogId, classLogId));

  if (existingImages.length === 0) {
    return;
  }

  await Promise.all(existingImages.map((image) => deleteBlobIfExists(image.url)));
};

/**
 * 📝 새로운 수업일지를 생성하는 서버 액션
 *
 * 동작 흐름:
 * 1. 관리자 권한 확인 (일반 사용자는 실행 불가)
 * 2. 폼에서 받은 데이터 검증 (제목, 내용, 날짜가 올바른지 확인)
 * 3. 데이터베이스에 저장
 * 4. 페이지 캐시 새로고침 (사용자가 최신 내용을 볼 수 있도록)
 *
 * 입력: formData (HTML 폼에서 받은 데이터)
 * 출력: { success: true } (성공) 또는 { success: false, error: "에러메시지" } (실패)
 */
export async function createClassLog(formData: FormData): Promise<ClassLogActionState> {
  // 1️⃣ 관리자인지 확인 (아니면 에러 발생)
  const session = await requireAdmin();

  // 2️⃣ 폼 데이터를 검증 규칙에 맞게 검사
  const parsed = classLogFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    classDate: formData.get("classDate"),
    cohortId: parseCohortId(formData.get("cohortId")),
  });

  // 검증 실패 시 에러 메시지 반환
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  // 3️⃣ 날짜 문자열을 Date 객체로 변환
  const classDate = toClassDate(parsed.data.classDate);
  if (!classDate) {
    return {
      success: false,
      error: "유효한 수업 날짜를 입력해주세요.",
    };
  }

  const validatedImages = getValidatedImageFiles(formData);
  if ("error" in validatedImages) {
    return {
      success: false,
      error: validatedImages.error,
    };
  }

  try {
    const [createdLog] = await db.insert(classLogs).values({
      title: parsed.data.title,
      content: parsed.data.content,
      classDate,
      cohortId: parsed.data.cohortId || null,
      authorId: session.user.id,
    }).returning({ id: classLogs.id });

    if (!createdLog) {
      return {
        success: false,
        error: "수업일지 생성에 실패했습니다.",
      };
    }

    await uploadClassLogImages(createdLog.id, parsed.data.title, validatedImages.files);

    revalidateClassLogPaths();

    return { success: true };
  } catch (error) {
    console.error("[class-logs/create] 생성 오류:", error);

    return {
      success: false,
      error: "수업일지 생성에 실패했습니다.",
    };
  }
}


/**
 * ✏️ 기존 수업일지를 수정하는 서버 액션
 *
 * 동작 흐름:
 * 1. 관리자 권한 확인
 * 2. 수정할 수업일지의 ID가 올바른지 확인
 * 3. 새로운 데이터 검증 (제목, 내용, 날짜 등)
 * 4. 데이터베이스에서 해당 수업일지 업데이트
 * 5. 페이지 캐시 새로고침
 *
 * 입력: id (수정할 수업일지 ID), formData (새로운 내용)
 * 출력: { success: true } (성공) 또는 { success: false, error: "에러메시지" } (실패)
 */
export async function updateClassLog(
  id: string,
  formData: FormData
): Promise<ClassLogActionState> {
  // 1️⃣ 관리자 권한 확인
  await requireAdmin();

  // 2️⃣ 수정할 수업일지의 ID 유효성 검사
  const parsedId = classLogIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 수업일지 ID입니다.",
    };
  }

  // 3️⃣ 새로운 폼 데이터 검증
  const parsed = classLogFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    classDate: formData.get("classDate"),
    cohortId: parseCohortId(formData.get("cohortId")),
  });

  // 검증 실패 시 에러 반환
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  // 4️⃣ 날짜 변환 및 유효성 검사
  const classDate = toClassDate(parsed.data.classDate);
  if (!classDate) {
    return {
      success: false,
      error: "유효한 수업 날짜를 입력해주세요.",
    };
  }

  const validatedImages = getValidatedImageFiles(formData);
  if ("error" in validatedImages) {
    return {
      success: false,
      error: validatedImages.error,
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

    if (validatedImages.files.length > 0) {
      await deleteClassLogImagesFromBlob(parsedId.data);
      await db.delete(classLogImages).where(eq(classLogImages.classLogId, parsedId.data));
      await uploadClassLogImages(parsedId.data, parsed.data.title, validatedImages.files);
    }

    revalidateClassLogPaths();

    return { success: true };
  } catch (error) {
    console.error("[class-logs/update] 수정 오류:", error);

    return {
      success: false,
      error: "수업일지 수정에 실패했습니다.",
    };
  }
}

/**
 * 🗑️ 수업일지를 삭제하는 서버 액션
 *
 * 동작 흐름:
 * 1. 관리자 권한 확인
 * 2. 삭제할 수업일지의 ID가 올바른지 확인
 * 3. 데이터베이스에서 해당 수업일지 삭제
 * 4. 페이지 캐시 새로고침
 *
 * 입력: id (삭제할 수업일지 ID)
 * 출력: { success: true } (성공) 또는 { success: false, error: "에러메시지" } (실패)
 * 
 * ⚠️ 주의: 이 작업은 되돌릴 수 없습니다! 삭제하면 완전히 사라집니다.
 */
export async function deleteClassLog(id: string): Promise<ClassLogActionState> {
  // 1️⃣ 관리자 권한 확인
  await requireAdmin();

  // 2️⃣ 삭제할 수업일지의 ID 유효성 검사
  const parsedId = classLogIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 수업일지 ID입니다.",
    };
  }

  try {
    const target = await db.query.classLogs.findFirst({
      where: eq(classLogs.id, parsedId.data),
      columns: {
        content: true,
      },
    });

    if (!target) {
      return {
        success: false,
        error: "수업일지를 찾을 수 없습니다.",
      };
    }

    await deleteMarkdownBlobImages(target.content);

    await deleteClassLogImagesFromBlob(parsedId.data);
    await db.delete(classLogs).where(eq(classLogs.id, parsedId.data));

    revalidateClassLogPaths();

    return { success: true };
  } catch (error) {
    console.error("[class-logs/delete] 삭제 오류:", error);

    return {
      success: false,
      error: "수업일지 삭제에 실패했습니다.",
    };
  }
}
