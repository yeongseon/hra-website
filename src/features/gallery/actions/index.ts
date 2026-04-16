"use server";

/**
 * 갤러리 서버 액션 모음
 *
 * 역할:
 * - 갤러리 메타데이터를 GitHub JSON 파일 대신 DB에 직접 저장합니다.
 * - 이미지 파일만 Vercel Blob에 업로드/삭제합니다.
 * - 관리자 페이지와 공개 페이지가 최신 데이터를 바로 보도록 경로를 재검증합니다.
 */

import { del, put } from "@vercel/blob";
import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
});

const imageSchema = z.object({
  alt: z.string().trim().max(255, "대체 텍스트는 255자 이하여야 합니다.").optional(),
  order: z.number().int().min(0, "정렬 순서는 0 이상이어야 합니다."),
});

const idSchema = z.uuid("잘못된 ID입니다.");

const initialError = (message: string): GalleryActionState => ({
  success: false,
  message,
});

const successState = (message: string): GalleryActionState => ({
  success: true,
  message,
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

function revalidateGalleryPaths(id: string) {
  revalidatePath("/gallery");
  revalidatePath(`/gallery/${id}`);
  revalidatePath("/admin/gallery");
  revalidatePath(`/admin/gallery/${id}/edit`);
}

async function getGalleryWithImages(id: string) {
  const gallery = await db.query.galleries.findFirst({
    where: eq(galleries.id, id),
    with: {
      images: {
        orderBy: [asc(galleryImages.order), asc(galleryImages.createdAt)],
      },
    },
  });

  return gallery ?? null;
}

async function getValidatedGallery(id: string) {
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) {
    return { error: parsedId.error.issues[0]?.message ?? "잘못된 ID입니다." } as const;
  }

  const gallery = await getGalleryWithImages(parsedId.data);
  if (!gallery) {
    return { error: "앨범을 찾을 수 없습니다." } as const;
  }

  return { gallery } as const;
}

export async function createGallery(formData: FormData): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = gallerySchema.safeParse({
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
  });

  if (!parsed.success) {
    return initialError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const [createdGallery] = await db
    .insert(galleries)
    .values({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
      coverImageUrl: null,
    })
    .returning({ id: galleries.id });

  if (!createdGallery) {
    return initialError("앨범 생성에 실패했습니다.");
  }

  revalidateGalleryPaths(createdGallery.id);
  redirect(`/admin/gallery/${createdGallery.id}/edit`);
}

export async function updateGallery(id: string, formData: FormData): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = gallerySchema.safeParse({
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
  });

  if (!parsed.success) {
    return initialError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const galleryResult = await getValidatedGallery(id);
  if ("error" in galleryResult) {
    return initialError(galleryResult.error ?? "앨범을 찾을 수 없습니다.");
  }

  await db
    .update(galleries)
    .set({
      title: parsed.data.title,
      description: parsed.data.description ?? null,
    })
    .where(eq(galleries.id, galleryResult.gallery.id));

  revalidateGalleryPaths(galleryResult.gallery.id);
  return successState("앨범 정보가 수정되었습니다.");
}

export async function deleteGallery(id: string): Promise<GalleryActionState> {
  await requireAdmin();

  const galleryResult = await getValidatedGallery(id);
  if ("error" in galleryResult) {
    return initialError(galleryResult.error ?? "앨범을 찾을 수 없습니다.");
  }

  // DB 레코드를 지우기 전에 Blob 이미지를 먼저 정리해 고아 파일을 남기지 않습니다.
  await Promise.all(galleryResult.gallery.images.map((image) => del(image.url)));

  await db.delete(galleries).where(eq(galleries.id, galleryResult.gallery.id));

  revalidateGalleryPaths(galleryResult.gallery.id);
  return successState("앨범이 삭제되었습니다.");
}

export async function addGalleryImage(id: string, formData: FormData): Promise<GalleryActionState> {
  await requireAdmin();

  const fileEntry = formData.get("image");
  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return initialError("이미지 파일을 선택해주세요.");
  }

  const parsed = imageSchema.safeParse({
    alt: normalizeOptionalText(formData.get("alt")),
    order: normalizeOrder(formData.get("order")),
  });

  if (!parsed.success) {
    return initialError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const galleryResult = await getValidatedGallery(id);
  if ("error" in galleryResult) {
    return initialError(galleryResult.error ?? "앨범을 찾을 수 없습니다.");
  }

  // Blob 파일명에서 공백을 제거해 URL 가독성과 안정성을 높입니다.
  const safeFileName = fileEntry.name.replace(/\s+/g, "-");
  const blob = await put(safeFileName, fileEntry, {
    access: "public",
  });

  await db.insert(galleryImages).values({
    galleryId: galleryResult.gallery.id,
    url: blob.url,
    alt: parsed.data.alt ?? null,
    order: parsed.data.order,
  });

  // 첫 이미지 업로드 시 자동으로 커버 이미지를 설정합니다.
  if (!galleryResult.gallery.coverImageUrl) {
    await db
      .update(galleries)
      .set({
        coverImageUrl: blob.url,
      })
      .where(eq(galleries.id, galleryResult.gallery.id));
  }

  revalidateGalleryPaths(galleryResult.gallery.id);
  return successState("이미지가 추가되었습니다.");
}

export async function deleteGalleryImage(id: string, imageId: string): Promise<GalleryActionState> {
  await requireAdmin();

  const parsedGalleryId = idSchema.safeParse(id);
  if (!parsedGalleryId.success) {
    return initialError(parsedGalleryId.error.issues[0]?.message ?? "잘못된 ID입니다.");
  }

  const parsedImageId = idSchema.safeParse(imageId);
  if (!parsedImageId.success) {
    return initialError(parsedImageId.error.issues[0]?.message ?? "잘못된 이미지 ID입니다.");
  }

  const gallery = await getGalleryWithImages(parsedGalleryId.data);
  if (!gallery) {
    return initialError("앨범을 찾을 수 없습니다.");
  }

  // 이미지가 해당 갤러리에 실제로 속한 항목인지 함께 검증합니다.
  const targetImage = await db.query.galleryImages.findFirst({
    where: and(
      eq(galleryImages.id, parsedImageId.data),
      eq(galleryImages.galleryId, parsedGalleryId.data),
    ),
  });

  if (!targetImage) {
    return initialError("이미지를 찾을 수 없습니다.");
  }

  // 커버가 삭제될 경우를 대비해 다음 커버 후보를 미리 계산합니다.
  const nextImages = gallery.images.filter((image) => image.id !== targetImage.id);
  const nextCoverImageUrl =
    gallery.coverImageUrl === targetImage.url
      ? (nextImages[0]?.url ?? null)
      : (gallery.coverImageUrl ?? nextImages[0]?.url ?? null);

  await del(targetImage.url);

  await db
    .delete(galleryImages)
    .where(
      and(
        eq(galleryImages.id, parsedImageId.data),
        eq(galleryImages.galleryId, parsedGalleryId.data),
      ),
    );

  await db
    .update(galleries)
    .set({
      coverImageUrl: nextCoverImageUrl,
    })
    .where(eq(galleries.id, parsedGalleryId.data));

  revalidateGalleryPaths(parsedGalleryId.data);
  return successState("이미지가 삭제되었습니다.");
}
