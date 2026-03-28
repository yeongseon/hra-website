"use server";

import { del, put } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { createOrUpdateFile, deleteFile, getFile } from "@/lib/github";

export type GalleryActionState = {
  success: boolean;
  message: string;
};

type GalleryImage = {
  url: string;
  alt?: string;
  order: number;
};

type GalleryMetadataFile = {
  title: string;
  description?: string;
  coverImageUrl: string | null;
  images: GalleryImage[];
  createdAt: string;
  updatedAt: string;
};

const gallerySchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  description: z.string().trim().max(5000, "설명은 5000자 이하여야 합니다.").optional(),
});

const imageSchema = z.object({
  alt: z.string().trim().max(255, "대체 텍스트는 255자 이하여야 합니다.").optional(),
  order: z.number().int().min(0, "정렬 순서는 0 이상이어야 합니다."),
});

const slugSchema = z
  .string()
  .trim()
  .min(1, "유효하지 않은 슬러그입니다.")
  .regex(/^[^/]+$/, "유효하지 않은 슬러그입니다.");

const imageUrlSchema = z.url("유효하지 않은 이미지 URL입니다.");

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

const sanitizeSlugPart = (title: string) => {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .replace(/[^a-z0-9-]/g, "");
};

const makeSlug = (title: string) => {
  const base = sanitizeSlugPart(title);
  const fallback = "gallery";
  return `${Date.now()}-${base.length > 0 ? base : fallback}`;
};

const getGalleryFilePath = (slug: string) => `content/gallery/${slug}.json`;

function parseGalleryMetadata(rawContent: string): GalleryMetadataFile | null {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawContent);
  } catch {
    return null;
  }

  const parsed = z
    .object({
      title: z.string(),
      description: z.string().optional(),
      coverImageUrl: z.string().nullable().optional(),
      images: z
        .array(
          z.object({
            url: z.string(),
            alt: z.string().optional(),
            order: z.number().int(),
          }),
        )
        .default([]),
      createdAt: z.string(),
      updatedAt: z.string(),
    })
    .safeParse(parsedJson);

  if (!parsed.success) {
    return null;
  }

  return {
    ...parsed.data,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
    images: [...parsed.data.images].sort((a, b) => a.order - b.order),
  };
}

async function getGalleryFileFromGitHub(slug: string) {
  const parsedSlug = slugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return { error: parsedSlug.error.issues[0]?.message ?? "유효하지 않은 슬러그입니다." } as const;
  }

  const filePath = getGalleryFilePath(parsedSlug.data);
  const file = await getFile(filePath);

  if (!file) {
    return { error: "앨범을 찾을 수 없습니다." } as const;
  }

  const metadata = parseGalleryMetadata(file.content);

  if (!metadata) {
    return { error: "앨범 메타데이터 형식이 올바르지 않습니다." } as const;
  }

  return {
    slug: parsedSlug.data,
    filePath,
    sha: file.sha,
    metadata,
  } as const;
}

function revalidateGalleryPaths(slug: string) {
  revalidatePath("/gallery");
  revalidatePath(`/gallery/${slug}`);
  revalidatePath("/admin/gallery");
  revalidatePath(`/admin/gallery/${slug}/edit`);
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

  const slug = makeSlug(parsed.data.title);
  const now = new Date().toISOString();
  const metadata: GalleryMetadataFile = {
    title: parsed.data.title,
    description: parsed.data.description,
    coverImageUrl: null,
    images: [],
    createdAt: now,
    updatedAt: now,
  };

  const result = await createOrUpdateFile(
    getGalleryFilePath(slug),
    JSON.stringify(metadata, null, 2),
    `갤러리 생성: ${parsed.data.title}`,
  );

  if (!result.success) {
    return initialError(result.error ?? "앨범 생성에 실패했습니다.");
  }

  revalidateGalleryPaths(slug);
  redirect(`/admin/gallery/${slug}/edit`);
}

export async function updateGallery(slug: string, formData: FormData): Promise<GalleryActionState> {
  await requireAdmin();

  const parsed = gallerySchema.safeParse({
    title: normalizeText(formData.get("title")),
    description: normalizeOptionalText(formData.get("description")),
  });

  if (!parsed.success) {
    return initialError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.");
  }

  const galleryFile = await getGalleryFileFromGitHub(slug);
  if ("error" in galleryFile) {
    return initialError(galleryFile.error ?? "앨범을 찾을 수 없습니다.");
  }

  const nextMetadata: GalleryMetadataFile = {
    ...galleryFile.metadata,
    title: parsed.data.title,
    description: parsed.data.description,
    updatedAt: new Date().toISOString(),
  };

  const result = await createOrUpdateFile(
    galleryFile.filePath,
    JSON.stringify(nextMetadata, null, 2),
    `갤러리 수정: ${parsed.data.title}`,
    galleryFile.sha,
  );

  if (!result.success) {
    return initialError(result.error ?? "앨범 수정에 실패했습니다.");
  }

  revalidateGalleryPaths(galleryFile.slug);
  return successState("앨범 정보가 수정되었습니다.");
}

export async function deleteGallery(slug: string): Promise<GalleryActionState> {
  await requireAdmin();

  const galleryFile = await getGalleryFileFromGitHub(slug);
  if ("error" in galleryFile) {
    return initialError(galleryFile.error ?? "앨범을 찾을 수 없습니다.");
  }

  for (const image of galleryFile.metadata.images) {
    await del(image.url);
  }

  const result = await deleteFile(galleryFile.filePath, galleryFile.sha, `갤러리 삭제: ${galleryFile.metadata.title}`);

  if (!result.success) {
    return initialError(result.error ?? "앨범 삭제에 실패했습니다.");
  }

  revalidateGalleryPaths(galleryFile.slug);
  return successState("앨범이 삭제되었습니다.");
}

export async function addGalleryImage(slug: string, formData: FormData): Promise<GalleryActionState> {
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

  const galleryFile = await getGalleryFileFromGitHub(slug);
  if ("error" in galleryFile) {
    return initialError(galleryFile.error ?? "앨범을 찾을 수 없습니다.");
  }

  const safeFileName = fileEntry.name.replace(/\s+/g, "-");
  const blob = await put(safeFileName, fileEntry, {
    access: "public",
  });

  const nextImages: GalleryImage[] = [...galleryFile.metadata.images, {
    url: blob.url,
    alt: parsed.data.alt,
    order: parsed.data.order,
  }].sort((a, b) => a.order - b.order);

  const nextMetadata: GalleryMetadataFile = {
    ...galleryFile.metadata,
    images: nextImages,
    coverImageUrl: galleryFile.metadata.coverImageUrl ?? blob.url,
    updatedAt: new Date().toISOString(),
  };

  const result = await createOrUpdateFile(
    galleryFile.filePath,
    JSON.stringify(nextMetadata, null, 2),
    `갤러리 이미지 추가: ${galleryFile.metadata.title}`,
    galleryFile.sha,
  );

  if (!result.success) {
    return initialError(result.error ?? "이미지 추가에 실패했습니다.");
  }

  revalidateGalleryPaths(galleryFile.slug);
  return successState("이미지가 추가되었습니다.");
}

export async function deleteGalleryImage(slug: string, imageUrl: string): Promise<GalleryActionState> {
  await requireAdmin();

  const parsedUrl = imageUrlSchema.safeParse(imageUrl);
  if (!parsedUrl.success) {
    return initialError(parsedUrl.error.issues[0]?.message ?? "잘못된 요청입니다.");
  }

  const galleryFile = await getGalleryFileFromGitHub(slug);
  if ("error" in galleryFile) {
    return initialError(galleryFile.error ?? "앨범을 찾을 수 없습니다.");
  }

  const targetImage = galleryFile.metadata.images.find((image) => image.url === parsedUrl.data);
  if (!targetImage) {
    return initialError("이미지를 찾을 수 없습니다.");
  }

  const nextImages = galleryFile.metadata.images
    .filter((image) => image.url !== parsedUrl.data)
    .sort((a, b) => a.order - b.order);

  await del(parsedUrl.data);

  const nextMetadata: GalleryMetadataFile = {
    ...galleryFile.metadata,
    images: nextImages,
    coverImageUrl:
      galleryFile.metadata.coverImageUrl === parsedUrl.data
        ? (nextImages[0]?.url ?? null)
        : galleryFile.metadata.coverImageUrl,
    updatedAt: new Date().toISOString(),
  };

  const result = await createOrUpdateFile(
    galleryFile.filePath,
    JSON.stringify(nextMetadata, null, 2),
    `갤러리 이미지 삭제: ${galleryFile.metadata.title}`,
    galleryFile.sha,
  );

  if (!result.success) {
    return initialError(result.error ?? "이미지 삭제에 실패했습니다.");
  }

  revalidateGalleryPaths(galleryFile.slug);
  return successState("이미지가 삭제되었습니다.");
}
