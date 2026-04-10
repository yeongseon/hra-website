"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faculty } from "@/lib/db/schema";

const facultyCategorySchema = z.enum(["CLASSICS", "BUSINESS", "LECTURE"]);

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
  imageUrl: z
    .string()
    .trim()
    .refine(
      (value) => {
        try {
          new URL(value);
          return true;
        } catch {
          return false;
        }
      },
      { message: "올바른 이미지 URL을 입력해주세요." }
    )
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
    imageUrl: normalizeText(formData.get("imageUrl")) || undefined,
    order: normalizeText(formData.get("order")) || "0",
  });
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

  await db.insert(faculty).values({
    name: parsed.data.name,
    category: parsed.data.category,
    currentPosition: parsed.data.currentPosition ?? null,
    formerPosition: parsed.data.formerPosition ?? null,
    imageUrl: parsed.data.imageUrl ?? null,
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

  await db
    .update(faculty)
    .set({
      name: parsed.data.name,
      category: parsed.data.category,
      currentPosition: parsed.data.currentPosition ?? null,
      formerPosition: parsed.data.formerPosition ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      order: parsed.data.order,
    })
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

  await db.delete(faculty).where(eq(faculty.id, parsedId.data));
  revalidatePath("/admin/faculty");
  revalidatePath("/faculty");
}
