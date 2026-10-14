"use server";

import { put } from "@vercel/blob";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classMaterials } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import { recordOwnedBlob } from "@/lib/owned-blob";

export type ClassMaterialActionState = {
  success: boolean;
  error?: string;
};

const CLASS_MATERIAL_AUDIENCE_VALUES = ["FACULTY", "STUDENT"] as const;

const classMaterialIdSchema = z.uuid("유효하지 않은 강의 자료 ID입니다.");

const classMaterialFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  weekNumber: z
    .union([z.literal(""), z.coerce.number().int("주차는 정수로 입력해주세요.").min(1, "주차는 1 이상이어야 합니다.")])
    .optional(),
  lectureTitle: z
    .union([z.literal(""), z.string().trim().max(200, "강의명은 200자 이하여야 합니다.")])
    .optional(),
  audience: z.enum(CLASS_MATERIAL_AUDIENCE_VALUES, {
    error: "자료 대상을 선택해주세요.",
  }),
  classDate: z.string().optional().nullable(),
});

const allowedExtensions = new Set(["pdf", "hwp", "doc", "docx", "ppt", "pptx"]);
const allowedMimeTypes = new Set([
  "application/pdf",
  "application/x-hwp",
  "application/vnd.hancom.hwp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
]);

const maxFileSize = 50 * 1024 * 1024;

const normalizeFileName = (fileName: string) => {
  const trimmed = fileName.trim();
  const sanitized = trimmed.replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "");

  return sanitized || "class-material";
};

const getFileExtension = (fileName: string) => {
  const segments = fileName.toLowerCase().split(".");
  return segments.length > 1 ? segments.at(-1) ?? "" : "";
};

const getValidatedFile = (value: FormDataEntryValue | null) => {
  if (!(value instanceof File) || value.size === 0) {
    return { error: "파일을 선택해주세요." } as const;
  }

  const extension = getFileExtension(value.name);
  if (!allowedExtensions.has(extension)) {
    return {
      error: "PDF, HWP, DOC, DOCX, PPT, PPTX 파일만 업로드할 수 있습니다.",
    } as const;
  }

  if (value.type && !allowedMimeTypes.has(value.type)) {
    return {
      error: "지원하지 않는 파일 형식입니다. 파일 형식을 다시 확인해주세요.",
    } as const;
  }

  if (value.size > maxFileSize) {
    return {
      error: "파일 크기는 50MB 이하여야 합니다.",
    } as const;
  }

  return { file: value } as const;
};

const revalidateClassMaterialPaths = () => {
  revalidatePath("/admin/resources/class-materials");
  revalidatePath("/resources");
  revalidatePath("/resources/class-materials");
};

export async function createClassMaterial(
  formData: FormData,
): Promise<ClassMaterialActionState> {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user) {
    return {
      success: false,
      error: "로그인 후 이용해주세요.",
    };
  }

  if (role !== "ADMIN" && role !== "FACULTY") {
    return {
      success: false,
      error: "교수진과 관리자만 강의 자료를 업로드할 수 있습니다.",
    };
  }

  const parsed = classMaterialFormSchema.safeParse({
    title: formData.get("title"),
    weekNumber: formData.get("weekNumber"),
    lectureTitle: formData.get("lectureTitle"),
    audience: formData.get("audience"),
    classDate: formData.get("classDate"),
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

  let uploadedBlobUrl: string | null = null;

  try {
    const classDateObj = parsed.data.classDate
      ? new Date(`${parsed.data.classDate}T00:00:00`)
      : null;

    if (classDateObj && Number.isNaN(classDateObj.getTime())) {
      return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
    }

    const safeFileName = normalizeFileName(validatedFile.file.name);
    const blob = await put(`class-materials/${Date.now()}-${safeFileName}`, validatedFile.file, {
      access: "public",
      addRandomSuffix: true,
    });
    uploadedBlobUrl = blob.url;
    await recordOwnedBlob(blob.url, session.user.id);

    await db.insert(classMaterials).values({
      title: parsed.data.title,
      fileUrl: blob.url,
      fileName: validatedFile.file.name,
      weekNumber: parsed.data.weekNumber === "" || parsed.data.weekNumber === undefined ? null : parsed.data.weekNumber,
      lectureTitle:
        parsed.data.lectureTitle === "" || parsed.data.lectureTitle === undefined
          ? null
          : parsed.data.lectureTitle,
      audience: parsed.data.audience,
      uploadedById: session.user.id,
      classDate: classDateObj,
    });

    revalidateClassMaterialPaths();

    return { success: true };
  } catch (error) {
    logServerError("class-materials/create", error, {
      audience: parsed.data.audience,
      hasUploadedBlob: uploadedBlobUrl !== null,
    });

    // INSERT 응답 오류만으로 커밋 여부를 단정할 수 없습니다. 원장에 남은
    // 미참조 파일은 쓰기를 멈춘 정리 작업에서 재검증한 뒤 삭제합니다.

    return {
      success: false,
      error: "강의 자료 저장에 실패했습니다.",
    };
  }
}

/**
 * 기존 강의 자료 수정 — 텍스트 필드 변경, 파일 교체(선택)
 * 새 파일이 없으면 기존 파일을 그대로 유지한다.
 */
export async function updateClassMaterial(id: string, formData: FormData): Promise<ClassMaterialActionState> {
  const session = await requireAdmin();

  const parsedId = classMaterialIdSchema.safeParse(id);
  if (!parsedId.success) {
    return { success: false, error: parsedId.error.issues[0]?.message ?? "유효하지 않은 ID입니다." };
  }

  const parsed = classMaterialFormSchema.safeParse({
    title: formData.get("title"),
    weekNumber: formData.get("weekNumber"),
    lectureTitle: formData.get("lectureTitle"),
    audience: formData.get("audience"),
    classDate: formData.get("classDate"),
  });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요." };
  }

  try {
    const target = await db.query.classMaterials.findFirst({
      where: eq(classMaterials.id, parsedId.data),
    });
    if (!target) {
      return { success: false, error: "강의 자료를 찾을 수 없습니다." };
    }

    const classDateObj = parsed.data.classDate
      ? new Date(`${parsed.data.classDate}T00:00:00`)
      : null;

    if (classDateObj && Number.isNaN(classDateObj.getTime())) {
      return { success: false, error: "유효한 수업 날짜를 입력해주세요." };
    }

    const textFields = {
      title: parsed.data.title,
      weekNumber: parsed.data.weekNumber === "" || parsed.data.weekNumber === undefined ? null : parsed.data.weekNumber,
      lectureTitle: parsed.data.lectureTitle === "" || parsed.data.lectureTitle === undefined ? null : parsed.data.lectureTitle,
      audience: parsed.data.audience,
      // 관리자 폼에는 날짜 입력이 없으므로 필드가 빠졌다면 기존 날짜를 보존합니다.
      classDate: formData.has("classDate") ? classDateObj : target.classDate,
    };

    const fileEntry = formData.get("file");
    const hasNewFile = fileEntry instanceof File && fileEntry.size > 0;

    if (hasNewFile) {
      // 새 파일 검증 및 업로드 후 DB 참조를 교체합니다. 이전 파일은 소유권이
      // 확인되지 않아 즉시 삭제하지 않습니다 (#93).
      const validatedFile = getValidatedFile(fileEntry);
      if ("error" in validatedFile) {
        return { success: false, error: validatedFile.error };
      }

      const safeFileName = normalizeFileName(validatedFile.file.name);
      const blob = await put(`class-materials/${Date.now()}-${safeFileName}`, validatedFile.file, { access: "public", addRandomSuffix: true });
      await recordOwnedBlob(blob.url, session.user.id);

      const [updated] = await db
        .update(classMaterials)
        .set({ ...textFields, fileUrl: blob.url, fileName: validatedFile.file.name })
        .where(and(eq(classMaterials.id, parsedId.data), eq(classMaterials.fileUrl, target.fileUrl)))
        .returning({ id: classMaterials.id });
      if (!updated) {
        return { success: false, error: "강의 자료 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." };
      }

    } else {
      // 파일 교체 없이 텍스트 필드만 수정
      const [updated] = await db
        .update(classMaterials)
        .set(textFields)
        .where(eq(classMaterials.id, parsedId.data))
        .returning({ id: classMaterials.id });
      if (!updated) return { success: false, error: "강의 자료를 찾을 수 없습니다." };
    }

    revalidateClassMaterialPaths();
    return { success: true };
  } catch (error) {
    logServerError("class-materials/update", error, {
      id: parsedId.data,
      audience: parsed.data.audience,
    });
    return { success: false, error: "강의 자료 수정에 실패했습니다." };
  }
}

export async function deleteClassMaterial(id: string): Promise<ClassMaterialActionState> {
  await requireAdmin();

  const parsedId = classMaterialIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: parsedId.error.issues[0]?.message ?? "유효하지 않은 강의 자료 ID입니다.",
    };
  }

  try {
    const target = await db.query.classMaterials.findFirst({
      where: eq(classMaterials.id, parsedId.data),
    });

    if (!target) {
      return {
        success: false,
        error: "강의 자료를 찾을 수 없습니다.",
      };
    }

    const [deleted] = await db.delete(classMaterials)
      .where(eq(classMaterials.id, parsedId.data))
      .returning({ id: classMaterials.id });
    if (!deleted) return { success: false, error: "강의 자료를 찾을 수 없습니다." };

    revalidateClassMaterialPaths();

    return { success: true };
  } catch (error) {
    logServerError("class-materials/delete", error, {
      id: parsedId.data,
    });

    return {
      success: false,
      error: "강의 자료 삭제에 실패했습니다.",
    };
  }
}
