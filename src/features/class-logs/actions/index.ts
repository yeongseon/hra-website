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
import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { deleteBlobIfExists, deleteMarkdownBlobImages, extractMarkdownBlobUrls } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { classLogImages, classLogs, users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";

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
export type ClassLogActionState = {
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

/**
 * 📝 새로운 수업일지를 생성하는 서버 액션 (멤버용)
 *
 * ADMIN, FACULTY, MEMBER 역할만 사용 가능. PENDING은 차단.
 * MEMBER는 본인 기수에만 업로드 가능.
 */
export async function createClassLogAsMember(formData: FormData): Promise<ClassLogActionState> {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user) {
    return { success: false, error: "로그인 후 이용해주세요." };
  }

  if (role !== "ADMIN" && role !== "FACULTY" && role !== "MEMBER") {
    return { success: false, error: "승인된 회원만 업로드할 수 있습니다." };
  }

  // MEMBER는 DB에서 본인 cohortId를 직접 조회해 강제 적용 (폼값 신뢰 금지)
  let forcedCohortId: string | null = null;
  if (role === "MEMBER") {
    const [userRow] = await db
      .select({ cohortId: users.cohortId })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1);

    if (!userRow?.cohortId) {
      return { success: false, error: "기수가 배정되지 않은 회원은 업로드할 수 없습니다." };
    }

    forcedCohortId = userRow.cohortId;
  }

  const parsed = classLogFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    classDate: formData.get("classDate"),
    cohortId: forcedCohortId ?? parseCohortId(formData.get("cohortId")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const classDate = toClassDate(parsed.data.classDate);
  if (!classDate) {
    return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
  }

  const validatedImages = getValidatedImageFiles(formData);
  if ("error" in validatedImages) {
    return { success: false, error: validatedImages.error };
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
      return { success: false, error: "수업일지 생성에 실패했습니다." };
    }

    await uploadClassLogImages(createdLog.id, parsed.data.title, validatedImages.files);

    revalidateClassLogPaths();
    revalidatePath("/resources/class-logs");

    return { success: true };
  } catch (error) {
    console.error("[class-logs/createAsMember] 생성 오류:", error);
    return { success: false, error: "수업일지 생성에 실패했습니다." };
  }
}

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
    // 마크다운 임베드 이미지 orphan 정리용: UPDATE 전에 옛 본문 스냅샷을 확보한다.
    // UPDATE 이후에 조회하면 이미 새 본문으로 덮어써져 옛 임베드 URL 을 알 수 없다.
    const existing = await db.query.classLogs.findFirst({
      where: eq(classLogs.id, parsedId.data),
      columns: {
        content: true,
      },
    });

    if (!existing) {
      return {
        success: false,
        error: "수업일지를 찾을 수 없습니다.",
      };
    }

    // 1단계) 텍스트 필드부터 저장한다.
    //   이미지 교체 로직과 분리해 두면, 이미지 처리 중 실패해도 텍스트 수정은 이미 반영되어
    //   사용자가 재시도 시 이미지만 다시 올리면 되도록 UX 가 단순해진다.
    await db
      .update(classLogs)
      .set({
        title: parsed.data.title,
        content: parsed.data.content,
        classDate,
        cohortId: parsed.data.cohortId || null,
      })
      .where(eq(classLogs.id, parsedId.data));

    // 텍스트 UPDATE 성공 확정 → 마크다운 임베드 orphan cleanup (best-effort).
    // 첨부 이미지(classLogImages 테이블) 처리와는 별개 — 이건 content 안에 삽입된 마크다운 이미지가 대상.
    // 동시성 주의: 두 관리자가 동시 편집 시 나중 저장자의 임베드가 오삭제될 수 있다 — accepted trade-off.
    const oldEmbeddedUrls = extractMarkdownBlobUrls(existing.content);
    const newEmbeddedUrls = new Set(extractMarkdownBlobUrls(parsed.data.content));
    const removedEmbeddedUrls = oldEmbeddedUrls.filter((url) => !newEmbeddedUrls.has(url));
    await Promise.all(removedEmbeddedUrls.map((url) => deleteBlobIfExists(url)));

    if (validatedImages.files.length > 0) {
      // 2단계) 기존 이미지의 id·url 스냅샷 확보.
      //   삭제 시점에 이 id 집합만 정확히 지워야 새로 insert 한 row 를 오삭제하지 않는다.
      const oldImageRows = await db
        .select({ id: classLogImages.id, url: classLogImages.url })
        .from(classLogImages)
        .where(eq(classLogImages.classLogId, parsedId.data));

      // 3단계) 새 이미지를 순차 업로드.
      //   Promise.all 을 쓰지 않는 이유: 중간 실패 시 이미 업로드된 URL 을 회수하기 위함.
      //   실패 시 uploadedUrls 를 best-effort 로 되지운 뒤 예외를 재throw 한다.
      const uploadedUrls: string[] = [];
      const newRows: (typeof classLogImages.$inferInsert)[] = [];

      try {
        for (let i = 0; i < validatedImages.files.length; i += 1) {
          const file = validatedImages.files[i];
          const blob = await put(
            `class-logs/${Date.now()}-${i}-${normalizeFileName(file.name)}`,
            file,
            { access: "public" },
          );
          uploadedUrls.push(blob.url);
          newRows.push({
            classLogId: parsedId.data,
            url: blob.url,
            alt: `${parsed.data.title} 사진 ${i + 1}`,
            order: i,
          });
        }
      } catch (uploadError) {
        // 업로드 도중 실패 → 새 blob 은 아무데도 참조되지 않으므로 안전하게 정리한다.
        await Promise.all(uploadedUrls.map((url) => deleteBlobIfExists(url)));
        throw uploadError;
      }

      // 4단계) 새 이미지 row 를 먼저 insert 한다.
      //   과거 구현처럼 "old delete → new insert" 순서면 insert 실패 시 이미지가 아예 사라진 상태가 되어
      //   사용자 관점에서 데이터 유실과 동일하다.
      //   여기서는 짧게나마 old+new 가 함께 보이는 창을 감수하고 참조 유지를 우선한다.
      try {
        await db.insert(classLogImages).values(newRows);
      } catch (insertError) {
        // insert 실패 → 새 blob 은 아직 참조되지 않으므로 되지운다.
        await Promise.all(uploadedUrls.map((url) => deleteBlobIfExists(url)));
        throw insertError;
      }

      // 5단계) 기존 row 만 id 기준으로 정확히 삭제.
      //   삭제 실패 시 옛 blob cleanup 은 절대 하지 않는다 (DB 가 여전히 옛 URL 을 참조 중).
      if (oldImageRows.length > 0) {
        try {
          await db.delete(classLogImages).where(
            inArray(
              classLogImages.id,
              oldImageRows.map((img) => img.id),
            ),
          );
        } catch (deleteError) {
          console.error("[class-logs/update] 기존 이미지 row 삭제 실패:", deleteError);
          throw deleteError;
        }

        // 6단계) 옛 blob cleanup (best-effort).
        //   deleteBlobIfExists 는 내부에서 예외를 삼키므로 여기서 실패해도 액션은 성공으로 끝난다.
        //   최악의 경우 orphan blob 이 남을 뿐이며, DB 참조는 이미 새 URL 로 전환되어 있다.
        await Promise.all(oldImageRows.map((img) => deleteBlobIfExists(img.url)));
      }
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
    // 삭제 전 스냅샷: 본문(마크다운 임베드) + 첨부 이미지 URL.
    // DB 를 먼저 지우면 참조 정보가 사라져 blob cleanup 불가.
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

    const attachedImageRows = await db
      .select({ url: classLogImages.url })
      .from(classLogImages)
      .where(eq(classLogImages.classLogId, parsedId.data));

    // 순서 원칙: DB 먼저 삭제 → blob cleanup (best-effort).
    // 역순으로 blob 을 먼저 지우면 DB 삭제 실패 시 깨진 URL 참조가 남는다.
    // classLogImages 는 onDelete: "cascade" 로 자동 삭제된다.
    await db.delete(classLogs).where(eq(classLogs.id, parsedId.data));

    // cleanup 실패는 로그만 남고 액션은 성공으로 끝난다 (orphan blob 만 남을 뿐 사용자 영향 없음).
    await Promise.all([
      deleteMarkdownBlobImages(target.content),
      ...attachedImageRows.map((img) => deleteBlobIfExists(img.url)),
    ]);

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
