import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type GalleryMetadata = {
  slug: string;
  title: string;
  description?: string;
  coverImageUrl?: string;
  images: { url: string; alt?: string; order: number }[];
  createdAt: string;
  updatedAt: string;
};

const galleryDirectoryPath = path.join(process.cwd(), "content", "gallery");

type RawGalleryImage = {
  url?: unknown;
  alt?: unknown;
  order?: unknown;
};

type RawGalleryMetadata = {
  title?: unknown;
  description?: unknown;
  coverImageUrl?: unknown;
  images?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function parseGalleryImage(rawImage: RawGalleryImage): { url: string; alt?: string; order: number } | null {
  if (typeof rawImage.url !== "string") {
    return null;
  }

  if (typeof rawImage.order !== "number") {
    return null;
  }

  if (!Number.isFinite(rawImage.order)) {
    return null;
  }

  if (rawImage.alt !== undefined && typeof rawImage.alt !== "string") {
    return null;
  }

  return {
    url: rawImage.url,
    alt: rawImage.alt,
    order: rawImage.order,
  };
}

function parseGalleryJson(rawJson: string, slug: string): GalleryMetadata | null {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawJson);
  } catch {
    return null;
  }

  if (!parsedJson || typeof parsedJson !== "object") {
    return null;
  }

  const rawGallery = parsedJson as RawGalleryMetadata;

  if (typeof rawGallery.title !== "string") {
    return null;
  }

  if (typeof rawGallery.createdAt !== "string" || typeof rawGallery.updatedAt !== "string") {
    return null;
  }

  if (!Array.isArray(rawGallery.images)) {
    return null;
  }

  const images = rawGallery.images
    .map((image) => parseGalleryImage(image as RawGalleryImage))
    .filter((image): image is { url: string; alt?: string; order: number } => image !== null)
    .sort((a, b) => a.order - b.order);

  const description = typeof rawGallery.description === "string" ? rawGallery.description : undefined;
  const coverImageUrl =
    typeof rawGallery.coverImageUrl === "string" ? rawGallery.coverImageUrl : undefined;

  return {
    slug,
    title: rawGallery.title,
    description,
    coverImageUrl,
    images,
    createdAt: rawGallery.createdAt,
    updatedAt: rawGallery.updatedAt,
  };
}

function compareGalleryByCreatedAtDesc(a: GalleryMetadata, b: GalleryMetadata): number {
  const timeA = Date.parse(a.createdAt);
  const timeB = Date.parse(b.createdAt);

  const normalizedA = Number.isNaN(timeA) ? 0 : timeA;
  const normalizedB = Number.isNaN(timeB) ? 0 : timeB;

  return normalizedB - normalizedA;
}

export async function getAllGalleries(): Promise<GalleryMetadata[]> {
  try {
    const entries = await readdir(galleryDirectoryPath);
    const galleryFileNames = entries.filter((entry) => entry.endsWith(".json"));

    const galleries = await Promise.all(
      galleryFileNames.map(async (fileName) => {
        const slug = fileName.replace(/\.json$/, "");
        const filePath = path.join(galleryDirectoryPath, fileName);
        const rawJson = await readFile(filePath, "utf8");

        return parseGalleryJson(rawJson, slug);
      }),
    );

    return galleries.filter((gallery): gallery is GalleryMetadata => gallery !== null).sort(compareGalleryByCreatedAtDesc);
  } catch {
    return [];
  }
}

export async function getGalleryBySlug(slug: string): Promise<GalleryMetadata | null> {
  try {
    const filePath = path.join(galleryDirectoryPath, `${slug}.json`);
    const rawJson = await readFile(filePath, "utf8");
    return parseGalleryJson(rawJson, slug);
  } catch {
    return null;
  }
}
