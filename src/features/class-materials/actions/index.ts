"use server";

import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classMaterials } from "@/lib/db/schema";

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
    const safeFileName = normalizeFileName(validatedFile.file.name);
    const blob = await put(`class-materials/${Date.now()}-${safeFileName}`, validatedFile.file, {
      access: "public",
    });
    uploadedBlobUrl = blob.url;

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
    });

    revalidateClassMaterialPaths();

    return { success: true };
  } catch (error) {
    console.error("[class-materials/create] 생성 오류:", error);

    if (uploadedBlobUrl) {
      try {
        await del(uploadedBlobUrl);
      } catch (blobDeleteError) {
        console.error("[class-materials/create] 업로드 롤백 오류:", blobDeleteError);
      }
    }

    return {
      success: false,
      error: "강의 자료 저장에 실패했습니다.",
    };
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

    await del(target.fileUrl);
    await db.delete(classMaterials).where(eq(classMaterials.id, parsedId.data));

    revalidateClassMaterialPaths();

    return { success: true };
  } catch (error) {
    console.error("[class-materials/delete] 삭제 오류:", error);

    return {
      success: false,
      error: "강의 자료 삭제에 실패했습니다.",
    };
  }
}
