"use server";

import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faculty } from "@/lib/db/schema";

const facultyCategorySchema = z.enum(["CLASSICS", "BUSINESS", "LECTURE"]);
const maxImageSize = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

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

function validateImageFile(fileEntry: FormDataEntryValue | null) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return {
      success: true as const,
      file: undefined,
    };
  }

  if (!allowedImageTypes.includes(fileEntry.type as (typeof allowedImageTypes)[number])) {
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

  return {
    success: true as const,
    file: fileEntry,
  };
}

async function uploadFacultyImage(file: File) {
  const safeFileName = file.name.replace(/\s+/g, "-");
  const blob = await put(`faculty/${safeFileName}`, file, { access: "public" });

  return blob.url;
}

export async function createFaculty(formData: FormData): Promise<FacultyActionState> {
  await requireAdmin();

  const parsed = parseFacultyFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const validatedImage = validateImageFile(formData.get("image"));
  if (!validatedImage.success) {
    return {
      success: false,
      message: validatedImage.message,
      fieldErrors: validatedImage.fieldErrors,
    };
  }

  const imageUrl = validatedImage.file ? await uploadFacultyImage(validatedImage.file) : null;

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
  await requireAdmin();

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

  const validatedImage = validateImageFile(formData.get("image"));
  if (!validatedImage.success) {
    return {
      success: false,
      message: validatedImage.message,
      fieldErrors: validatedImage.fieldErrors,
    };
  }

  const [existingFaculty] = await db
    .select({ imageUrl: faculty.imageUrl })
    .from(faculty)
    .where(eq(faculty.id, parsedId.data));

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

  if (validatedImage.file) {
    if (existingFaculty?.imageUrl) {
      await del(existingFaculty.imageUrl);
    }

    updateValues.imageUrl = await uploadFacultyImage(validatedImage.file);
  }

  await db
    .update(faculty)
    .set(updateValues)
    .where(eq(faculty.id, parsedId.data));

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

  const [existingFaculty] = await db
    .select({ imageUrl: faculty.imageUrl })
    .from(faculty)
    .where(eq(faculty.id, parsedId.data));

  if (existingFaculty?.imageUrl) {
    await del(existingFaculty.imageUrl);
  }

  await db.delete(faculty).where(eq(faculty.id, parsedId.data));
  revalidatePath("/admin/faculty");
  revalidatePath("/faculty");
}
