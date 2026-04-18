"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";

const alumniStoryFormSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(100, "이름은 100자 이하여야 합니다."),
  title: z.string().trim().max(100, "소속/직함은 100자 이하여야 합니다.").optional(),
  quote: z.string().trim().min(1, "인용구를 입력해주세요.").max(500, "인용구는 500자 이하여야 합니다."),
  content: z.string().trim().min(1, "내용을 입력해주세요.").max(5000, "내용은 5000자 이하여야 합니다."),
  imageUrl: z.string().trim().optional(),
  isFeatured: z.coerce.boolean().default(false),
  order: z.coerce
    .number({ message: "순서는 숫자여야 합니다." })
    .int("순서는 정수여야 합니다."),
});

export type AlumniStoryActionState = {
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

function parseAlumniStoryFormData(formData: FormData) {
  return alumniStoryFormSchema.safeParse({
    name: normalizeText(formData.get("name")),
    title: normalizeText(formData.get("title")) || undefined,
    quote: normalizeText(formData.get("quote")),
    content: normalizeText(formData.get("content")),
    imageUrl: normalizeText(formData.get("imageUrl")) || undefined,
    isFeatured: formData.get("isFeatured"),
    order: normalizeText(formData.get("order")) || "0",
  });
}

function revalidateAlumniPaths() {
  revalidatePath("/");
  revalidatePath("/admin/alumni");
  revalidatePath("/alumni");
}

export async function createAlumniStory(formData: FormData): Promise<AlumniStoryActionState> {
  await requireAdmin();

  const parsed = parseAlumniStoryFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await db.insert(alumniStories).values({
    name: parsed.data.name,
    title: parsed.data.title ?? null,
    quote: parsed.data.quote,
    content: parsed.data.content,
    imageUrl: parsed.data.imageUrl ?? null,
    isFeatured: parsed.data.isFeatured,
    order: parsed.data.order,
  });

  revalidateAlumniPaths();
  redirect("/admin/alumni");
}

export async function updateAlumniStory(id: string, formData: FormData): Promise<AlumniStoryActionState> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 수료생 이야기 ID입니다.",
    };
  }

  const parsed = parseAlumniStoryFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await db
    .update(alumniStories)
    .set({
      name: parsed.data.name,
      title: parsed.data.title ?? null,
      quote: parsed.data.quote,
      content: parsed.data.content,
      imageUrl: parsed.data.imageUrl ?? null,
      isFeatured: parsed.data.isFeatured,
      order: parsed.data.order,
    })
    .where(eq(alumniStories.id, parsedId.data));

  revalidateAlumniPaths();
  redirect("/admin/alumni");
}

export async function deleteAlumniStory(id: string): Promise<void> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  await db.delete(alumniStories).where(eq(alumniStories.id, parsedId.data));
  revalidateAlumniPaths();
}
