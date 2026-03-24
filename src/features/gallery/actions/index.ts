"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { galleries, galleryImages } from "@/lib/db/schema";

export type GalleryActionState = {
  success: boolean;
  message: string;
};

const gallerySchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  description: z.string().trim().max(5000, "설명은 5000자 이하여야 합니다.").optional(),
  coverImageUrl: z.url("올바른 이미지 URL을 입력해주세요.").optional(),
});

const updateGallerySchema = gallerySchema.extend({
  id: z.uuid("유효하지 않은 앨범 ID입니다."),
});

const imageSchema = z.object({
  galleryId: z.uuid("유효하지 않은 앨범 ID입니다."),
  url: z.url("올바른 이미지 URL을 입력해주세요."),
  alt: z.string().trim().max(255, "대체 텍스트는 255자 이하여야 합니다.").optional(),
  order: z.number().int().min(0, "정렬 순서는 0 이상이어야 합니다."),
});

const imageDeleteSchema = z.object({
  id: z.uuid("유효하지 않은 이미지 ID입니다."),
});

const normalizeText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const normalizeOptionalText = (value: FormDataEntryValue | null) => {
  const text = normalizeText(value);
  return text.length > 0 ? text : undefined;
};

const normalizeOrder = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isNaN(parsed) ? -1 : parsed;
};

const successState = (message: string): GalleryActionState => ({ success: true, message });
const errorState = (message: string): GalleryActionState => ({ success: false, message });

export async function createGallery(formData: FormData): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = gallerySchema.safeParse({
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
    coverImageUrl: normalizeOptionalText(formData.get("coverImageUrl")),
  });

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  await db.insert(galleries).values({
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
  });

  revalidatePath("/admin/gallery");

  return successState("앨범이 생성되었습니다.");
}

export async function updateGallery(id: string, formData: FormData): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = updateGallerySchema.safeParse({
    id,
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
    coverImageUrl: normalizeOptionalText(formData.get("coverImageUrl")),
  });

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const [existingGallery] = await db
    .select({ id: galleries.id })
    .from(galleries)
    .where(eq(galleries.id, parsed.data.id))
    .limit(1);

  if (!existingGallery) {
    return errorState("앨범을 찾을 수 없습니다.");
  }

  await db
    .update(galleries)
    .set({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      coverImageUrl: parsed.data.coverImageUrl ?? null,
      updatedAt: new Date(),
    })
    .where(eq(galleries.id, parsed.data.id));

  revalidatePath("/admin/gallery");

  return successState("앨범 정보가 수정되었습니다.");
}

export async function deleteGallery(id: string): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = z.uuid("유효하지 않은 앨범 ID입니다.").safeParse(id);

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "잘못된 요청입니다.");
  }

  await db.delete(galleries).where(eq(galleries.id, parsed.data));

  revalidatePath("/admin/gallery");

  return successState("앨범이 삭제되었습니다.");
}

export async function addGalleryImage(formData: FormData): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = imageSchema.safeParse({
    galleryId: normalizeText(formData.get("galleryId")),
    url: normalizeText(formData.get("url")),
    alt: normalizeOptionalText(formData.get("alt")),
    order: normalizeOrder(formData.get("order")),
  });

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const [existingGallery] = await db
    .select({ id: galleries.id })
    .from(galleries)
    .where(eq(galleries.id, parsed.data.galleryId))
    .limit(1);

  if (!existingGallery) {
    return errorState("앨범을 찾을 수 없습니다.");
  }

  await db.insert(galleryImages).values({
    galleryId: parsed.data.galleryId,
    url: parsed.data.url,
    alt: parsed.data.alt ?? null,
    order: parsed.data.order,
  });

  revalidatePath("/admin/gallery");
  revalidatePath(`/admin/gallery/${parsed.data.galleryId}/edit`);

  return successState("이미지가 추가되었습니다.");
}

export async function deleteGalleryImage(id: string): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = imageDeleteSchema.safeParse({ id });

  if (!parsed.success) {
    return errorState(parsed.error.issues[0]?.message ?? "잘못된 요청입니다.");
  }

  const [existingImage] = await db
    .select({ id: galleryImages.id, galleryId: galleryImages.galleryId })
    .from(galleryImages)
    .where(eq(galleryImages.id, parsed.data.id))
    .limit(1);

  if (!existingImage) {
    return errorState("이미지를 찾을 수 없습니다.");
  }

  await db
    .delete(galleryImages)
    .where(and(eq(galleryImages.id, parsed.data.id), eq(galleryImages.galleryId, existingImage.galleryId)));

  revalidatePath("/admin/gallery");
  revalidatePath(`/admin/gallery/${existingImage.galleryId}/edit`);

  return successState("이미지가 삭제되었습니다.");
}
