"use server";

import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";

const maxImageSize = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

const alumniStoryFormSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(100, "이름은 100자 이하여야 합니다."),
  title: z.string().trim().max(100, "소속/직함은 100자 이하여야 합니다.").optional(),
  quote: z.string().trim().min(1, "인용구를 입력해주세요.").max(500, "인용구는 500자 이하여야 합니다."),
  content: z.string().trim().min(1, "내용을 입력해주세요.").max(5000, "내용은 5000자 이하여야 합니다."),
  imageUrl: z.string().trim().optional(),
  isFeatured: z
    .union([z.literal("true"), z.literal("on"), z.null(), z.undefined()])
    .transform((value) => value === "true" || value === "on"),
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

function validateImageFile(fileEntry: FormDataEntryValue | null) {
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return { success: true as const, file: undefined };
  }

  if (!allowedImageTypes.includes(fileEntry.type as (typeof allowedImageTypes)[number])) {
    return {
      success: false as const,
      message: "이미지는 JPG, PNG, WEBP 파일만 업로드할 수 있습니다.",
      fieldErrors: { image: "이미지는 JPG, PNG, WEBP 파일만 업로드할 수 있습니다." },
    };
  }

  if (fileEntry.size > maxImageSize) {
    return {
      success: false as const,
      message: "이미지는 5MB 이하만 업로드할 수 있습니다.",
      fieldErrors: { image: "이미지는 5MB 이하만 업로드할 수 있습니다." },
    };
  }

  return { success: true as const, file: fileEntry };
}

async function uploadAlumniImage(file: File) {
  const safeFileName = file.name.replace(/\s+/g, "-");
  const blob = await put(`alumni/${safeFileName}`, file, { access: "public" });
  return blob.url;
}

function isBlobUrl(url: string) {
  return url.includes(".vercel-storage.com") || url.includes(".blob.vercel-storage.com");
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

  const validatedImage = validateImageFile(formData.get("image"));
  if (!validatedImage.success) {
    return {
      success: false,
      message: validatedImage.message,
      fieldErrors: validatedImage.fieldErrors,
    };
  }

  // 파일 업로드가 있으면 Blob URL 사용, 없으면 직접 입력한 URL 사용
  const imageUrl = validatedImage.file
    ? await uploadAlumniImage(validatedImage.file)
    : (parsed.data.imageUrl ?? null);

  await db.insert(alumniStories).values({
    name: parsed.data.name,
    title: parsed.data.title ?? null,
    quote: parsed.data.quote,
    content: parsed.data.content,
    imageUrl,
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

  const validatedImage = validateImageFile(formData.get("image"));
  if (!validatedImage.success) {
    return {
      success: false,
      message: validatedImage.message,
      fieldErrors: validatedImage.fieldErrors,
    };
  }

  const [existing] = await db
    .select({ imageUrl: alumniStories.imageUrl })
    .from(alumniStories)
    .where(eq(alumniStories.id, parsedId.data));

  let imageUrl: string | null;

  if (validatedImage.file) {
    // 새 파일 업로드 → 기존 Blob 이미지 삭제
    if (existing?.imageUrl && isBlobUrl(existing.imageUrl)) {
      await del(existing.imageUrl);
    }
    imageUrl = await uploadAlumniImage(validatedImage.file);
  } else {
    // 파일 업로드 없음 → URL 입력값 사용
    imageUrl = parsed.data.imageUrl ?? null;
  }

  await db
    .update(alumniStories)
    .set({
      name: parsed.data.name,
      title: parsed.data.title ?? null,
      quote: parsed.data.quote,
      content: parsed.data.content,
      imageUrl,
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

  const [existing] = await db
    .select({ imageUrl: alumniStories.imageUrl })
    .from(alumniStories)
    .where(eq(alumniStories.id, parsedId.data));

  if (existing?.imageUrl && isBlobUrl(existing.imageUrl)) {
    await del(existing.imageUrl);
  }

  await db.delete(alumniStories).where(eq(alumniStories.id, parsedId.data));
  revalidateAlumniPaths();
}
