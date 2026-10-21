/** 교수진 관리 서버 액션: 관리자 권한과 입력값을 확인하고 프로필 이미지를 검증해 저장합니다. */
"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faculty } from "@/lib/db/schema";
import { uploadWithOwnedIntent } from "@/lib/server-upload-intent";
import { validateAdminImage, type ValidatedAdminImage } from "@/lib/admin-image-validation";
import { facultyImageRule } from "@/lib/faculty-upload-contract";
import { validateFacultyImageReference } from "@/lib/faculty-upload-server";

const facultyCategorySchema = z.enum(["CLASSICS", "BUSINESS", "LECTURE"]);
const maxImageSize = 5 * 1024 * 1024;

const facultySchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(100, "이름은 100자 이하여야 합니다."),
  category: facultyCategorySchema,
  currentPosition: z
    .string()
    .trim()
    .max(500, "현직은 500자 이하여야 합니다.")
    .optional(),
  formerPosition: z
    .string()
    .trim()
    .max(500, "전직은 500자 이하여야 합니다.")
    .optional(),
  order: z.coerce
    .number({ message: "순서는 숫자여야 합니다." })
    .int("순서는 정수여야 합니다.")
    .default(0),
});

export type FacultyActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

function normalizeText(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function issuesToFieldErrors(issues: Array<{ path: PropertyKey[]; message: string }>) {
  const fieldErrors: Record<string, string> = {};

  for (const issue of issues) {
    const [field] = issue.path;
    if (typeof field === "string" && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return fieldErrors;
}

function parseFacultyFormData(formData: FormData) {
  return facultySchema.safeParse({
    name: normalizeText(formData.get("name")),
    category: normalizeText(formData.get("category")),
    currentPosition: normalizeText(formData.get("currentPosition")) || undefined,
    formerPosition: normalizeText(formData.get("formerPosition")) || undefined,
    order: normalizeText(formData.get("order")) || "0",
  });
}

async function validateImageFile(fileEntry: FormDataEntryValue | null) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return {
      success: true as const,
      file: undefined,
    };
  }

  const image = await validateAdminImage(fileEntry, facultyImageRule);
  if (!image) {
    return {
      success: false as const,
      message: "프로필 사진은 JPG, PNG, WEBP 파일만 업로드할 수 있습니다.",
      fieldErrors: { image: "프로필 사진은 JPG, PNG, WEBP 파일만 업로드할 수 있습니다." },
    };
  }

  if (fileEntry.size > maxImageSize) {
    return {
      success: false as const,
      message: "프로필 사진은 5MB 이하만 업로드할 수 있습니다.",
      fieldErrors: { image: "프로필 사진은 5MB 이하만 업로드할 수 있습니다." },
    };
  }

  // 서버 액션을 직접 호출하는 구형 요청은 플랫폼 본문 한도 아래로 제한합니다.
  if (fileEntry.size > 3 * 1024 * 1024) {
    return { success: false as const, message: "프로필 사진을 다시 선택해 업로드해주세요.", fieldErrors: { image: "프로필 사진을 다시 선택해 업로드해주세요." } };
  }

  return {
    success: true as const,
    file: image,
  };
}

/** 완료 URL의 UUID 대상·업로더와 Blob 실물을 모두 검증합니다. */
async function getUploadedFacultyImage(formData: FormData, targetId: string, userId: string): Promise<{ url: string | null } | { error: string }> {
  const value = formData.get("uploadedImageUrl");
  if (value === null) return { url: null };
  const claimedTargetId = z.uuid().safeParse(formData.get("uploadTargetId"));
  if (typeof value !== "string" || value.length > 2_000 || !claimedTargetId.success || claimedTargetId.data !== targetId ||
      !await validateFacultyImageReference(targetId, userId, value)) {
    return { error: "업로드한 프로필 사진을 확인할 수 없습니다. 다시 업로드해주세요." };
  }
  return { url: value };
}

/** 검증된 형식만 UUID 경로로 원장에 선예약하고 원래 파일명은 공개 경로에 넣지 않습니다 (#302). */
async function uploadFacultyImage(image: ValidatedAdminImage, uploadedById: string) {
  return uploadWithOwnedIntent({
    namespace: "faculty",
    extension: image.extension,
    body: image.file,
    contentType: image.contentType,
    uploadedById,
  });
}

export async function createFaculty(formData: FormData): Promise<FacultyActionState> {
  const session = await requireAdmin();

  const parsed = parseFacultyFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const validatedImage = await validateImageFile(formData.get("image"));
  if (!validatedImage.success) {
    return {
      success: false,
      message: validatedImage.message,
      fieldErrors: validatedImage.fieldErrors,
    };
  }

  const targetId = z.uuid().safeParse(formData.get("uploadTargetId"));
  if (formData.has("uploadedImageUrl") && !targetId.success) {
    return { success: false, message: "업로드한 프로필 사진을 확인할 수 없습니다." };
  }
  const directImage = targetId.success
    ? await getUploadedFacultyImage(formData, targetId.data, session.user.id)
    : { url: null };
  if ("error" in directImage) return { success: false, message: directImage.error, fieldErrors: { image: directImage.error } };

  const imageUrl = directImage.url ?? (validatedImage.file ? await uploadFacultyImage(validatedImage.file, session.user.id) : null);

  await db.insert(faculty).values({
    name: parsed.data.name,
    category: parsed.data.category,
    currentPosition: parsed.data.currentPosition ?? null,
    formerPosition: parsed.data.formerPosition ?? null,
    imageUrl,
    order: parsed.data.order,
  });

  revalidatePath("/admin/faculty");
  revalidatePath("/faculty");
  redirect("/admin/faculty");
}

export async function updateFaculty(id: string, formData: FormData): Promise<FacultyActionState> {
  const session = await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 교수진 ID입니다.",
    };
  }

  const parsed = parseFacultyFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const validatedImage = await validateImageFile(formData.get("image"));
  if (!validatedImage.success) {
    return {
      success: false,
      message: validatedImage.message,
      fieldErrors: validatedImage.fieldErrors,
    };
  }

  const directImage = await getUploadedFacultyImage(formData, parsedId.data, session.user.id);
  if ("error" in directImage) return { success: false, message: directImage.error, fieldErrors: { image: directImage.error } };

  const [existingFaculty] = await db
    .select({ imageUrl: faculty.imageUrl })
    .from(faculty)
    .where(eq(faculty.id, parsedId.data));

  if (!existingFaculty) {
    return { success: false, message: "교수진을 찾을 수 없습니다." };
  }

  const updateValues: {
    name: string;
    category: z.infer<typeof facultyCategorySchema>;
    currentPosition: string | null;
    formerPosition: string | null;
    order: number;
    imageUrl?: string | null;
  } = {
    name: parsed.data.name,
    category: parsed.data.category,
    currentPosition: parsed.data.currentPosition ?? null,
    formerPosition: parsed.data.formerPosition ?? null,
    order: parsed.data.order,
  };

  if (directImage.url) {
    updateValues.imageUrl = directImage.url;
  } else if (validatedImage.file) {
    updateValues.imageUrl = await uploadFacultyImage(validatedImage.file, session.user.id);
  }

  // 이전 사진 URL을 조건에 포함해 다른 관리자가 먼저 교체한 내용을 덮어쓰지 않습니다.
  // 기존 파일은 업로드 소유권이 확인되지 않아 여기서 즉시 삭제하지 않습니다.
  const [updated] = await db
    .update(faculty)
    .set(updateValues)
    .where(and(
      eq(faculty.id, parsedId.data),
      existingFaculty.imageUrl
        ? eq(faculty.imageUrl, existingFaculty.imageUrl)
        : isNull(faculty.imageUrl),
    ))
    .returning({ id: faculty.id });

  if (!updated) {
    return { success: false, message: "교수진 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." };
  }

  revalidatePath("/admin/faculty");
  revalidatePath("/faculty");
  redirect("/admin/faculty");
}

export async function deleteFaculty(id: string): Promise<void> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  // 삭제할 파일의 소유권이 기록되지 않은 기존 행은 DB만 제거해 파일 유실을 막습니다.
  await db.delete(faculty).where(eq(faculty.id, parsedId.data));
  revalidatePath("/admin/faculty");
  revalidatePath("/faculty");
}
