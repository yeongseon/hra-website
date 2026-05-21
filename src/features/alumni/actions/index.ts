"use server";

import { put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteBlobIfExists, isBlobUrl } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { alumniStories, alumniStoryImages } from "@/lib/db/schema";

const maxImageSize = 5 * 1024 * 1024;
const allowedImageTypes = ["image/jpeg", "image/png", "image/webp"] as const;

const alumniStoryFormSchema = z.object({
  name: z.string().trim().min(1, "이름을 입력해주세요.").max(100, "이름은 100자 이하여야 합니다."),
  title: z.string().trim().max(100, "소속/직함은 100자 이하여야 합니다.").optional(),
  quote: z.string().trim().min(1, "대표 문구를 입력해주세요.").max(500, "대표 문구는 500자 이하여야 합니다."),
  content: z.string().trim().min(1, "내용을 입력해주세요.").max(5000, "내용은 5000자 이하여야 합니다."),
  imageUrl: z.string().optional(), // 대표 이미지 URL
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

function validateImageFiles(formData: FormData) {
  const files = formData.getAll("images") as File[];
  const validFiles: File[] = [];

  for (const file of files) {
    if (file.size === 0) continue;

    if (!allowedImageTypes.includes(file.type as (typeof allowedImageTypes)[number])) {
      return {
        success: false as const,
        message: "이미지는 JPG, PNG, WEBP 파일만 업로드할 수 있습니다.",
        fieldErrors: { images: "이미지는 JPG, PNG, WEBP 파일만 업로드할 수 있습니다." },
      };
    }

    if (file.size > maxImageSize) {
      return {
        success: false as const,
        message: "이미지는 5MB 이하만 업로드할 수 있습니다.",
        fieldErrors: { images: "이미지는 5MB 이하만 업로드할 수 있습니다." },
      };
    }
    validFiles.push(file);
  }

  return { success: true as const, files: validFiles };
}

async function uploadAlumniImage(file: File) {
  const timestamp = Date.now();
  const safeFileName = `${timestamp}-${file.name.replace(/\s+/g, "-")}`;
  const blob = await put(`alumni/${safeFileName}`, file, { access: "public" });
  return blob.url;
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

  const validatedImages = validateImageFiles(formData);
  if (!validatedImages.success) {
    return {
      success: false,
      message: validatedImages.message,
      fieldErrors: validatedImages.fieldErrors,
    };
  }

  const uploadedUrls: string[] = [];
  for (const file of validatedImages.files) {
    const url = await uploadAlumniImage(file);
    uploadedUrls.push(url);
  }

  // 대표 이미지 결정
  const representativeUrl = parsed.data.imageUrl || (uploadedUrls.length > 0 ? uploadedUrls[0] : null);

  const [newStory] = await db.insert(alumniStories).values({
    name: parsed.data.name,
    title: parsed.data.title ?? null,
    quote: parsed.data.quote,
    content: parsed.data.content,
    imageUrl: representativeUrl,
    isFeatured: parsed.data.isFeatured,
    order: parsed.data.order,
  }).returning({ id: alumniStories.id });

  if (uploadedUrls.length > 0) {
    await db.insert(alumniStoryImages).values(
      uploadedUrls.map((url, index) => ({
        alumniStoryId: newStory.id,
        url,
        order: index,
      }))
    );
  }

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

  const validatedImages = validateImageFiles(formData);
  if (!validatedImages.success) {
    return {
      success: false,
      message: validatedImages.message,
      fieldErrors: validatedImages.fieldErrors,
    };
  }

  const uploadedUrls: string[] = [];
  for (const file of validatedImages.files) {
    const url = await uploadAlumniImage(file);
    uploadedUrls.push(url);
  }

  const [existing] = await db
    .select({ imageUrl: alumniStories.imageUrl })
    .from(alumniStories)
    .where(eq(alumniStories.id, parsedId.data));

  await db
    .update(alumniStories)
    .set({
      name: parsed.data.name,
      title: parsed.data.title ?? null,
      quote: parsed.data.quote,
      content: parsed.data.content,
      imageUrl: parsed.data.imageUrl || existing?.imageUrl,
      isFeatured: parsed.data.isFeatured,
      order: parsed.data.order,
    })
    .where(eq(alumniStories.id, parsedId.data));

  if (uploadedUrls.length > 0) {
    await db.insert(alumniStoryImages).values(
      uploadedUrls.map((url, index) => ({
        alumniStoryId: parsedId.data,
        url,
        order: index,
      }))
    );
  }

  revalidateAlumniPaths();
  redirect("/admin/alumni");
}

export async function deleteAlumniStory(id: string): Promise<void> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  const images = await db
    .select({ url: alumniStoryImages.url })
    .from(alumniStoryImages)
    .where(eq(alumniStoryImages.alumniStoryId, parsedId.data));

  for (const img of images) {
    if (isBlobUrl(img.url)) {
      await deleteBlobIfExists(img.url);
    }
  }

  await db.delete(alumniStories).where(eq(alumniStories.id, parsedId.data));
  revalidateAlumniPaths();
}
