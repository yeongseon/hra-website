"use server";

import { put } from "@vercel/blob";
import { eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteBlobIfExists, isBlobUrl } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { reorderByCase } from "@/lib/db/reorder";
import { alumniStories, alumniStoryImages } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";

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

  try {
    const uploadedUrls: string[] = [];
    for (const file of validatedImages.files) {
      const url = await uploadAlumniImage(file);
      uploadedUrls.push(url);
    }

    // 대표 이미지 결정
    const representativeUrl = parsed.data.imageUrl || (uploadedUrls.length > 0 ? uploadedUrls[0] : null);

    // 새 항목은 목록 맨 아래에 추가: 기존 최대 order + 1
    const [{ maxOrder }] = await db.select({ maxOrder: max(alumniStories.order) }).from(alumniStories);
    const nextOrder = (maxOrder ?? 0) + 1;

    const [newStory] = await db.insert(alumniStories).values({
      name: parsed.data.name,
      title: parsed.data.title ?? null,
      quote: parsed.data.quote,
      content: parsed.data.content,
      imageUrl: representativeUrl,
      isFeatured: parsed.data.isFeatured,
      order: nextOrder,
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
  } catch (error) {
    logServerError("alumni/create", error);
    return {
      success: false,
      message: "데이터베이스 저장 중 오류가 발생했습니다. DB 마이그레이션 상태를 확인해주세요.",
    };
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

  try {
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
  } catch (error) {
    logServerError("alumni/update", error, { id: parsedId.data });
    return {
      success: false,
      message: "수정 중 오류가 발생했습니다. DB 마이그레이션 상태를 확인해주세요.",
    };
  }

  revalidateAlumniPaths();
  redirect("/admin/alumni");
}

// 수료생 이야기 상단 고정 토글
export async function toggleAlumniPin(id: string): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return { success: false, message: "잘못된 ID입니다." };
  }

  const current = await db.query.alumniStories.findFirst({
    where: eq(alumniStories.id, parsedId.data),
    columns: { pinned: true },
  });

  if (!current) {
    return { success: false, message: "수료생 이야기를 찾을 수 없습니다." };
  }

  await db
    .update(alumniStories)
    .set({ pinned: !current.pinned })
    .where(eq(alumniStories.id, parsedId.data));

  revalidateAlumniPaths();
  return { success: true, message: current.pinned ? "고정을 해제했습니다." : "상단에 고정했습니다." };
}

// 수료생 이야기 순서 일괄 변경 — 드래그앤드롭 결과를 DB에 저장
// orderedIds: 새 순서대로 정렬된 수료생 이야기 ID 배열
// 단일 UPDATE ... CASE 문(reorderByCase 헬퍼)으로 원자적으로 갱신 —
// 개별 UPDATE 루프에서 중간 실패 시 정렬 상태가 뒤엉키던 문제를 근본 차단한다.
export async function reorderAlumniStories(
  orderedIds: string[]
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  // Oracle Phase D 5라운드 BLOCK 수정 — orderedIds 각 원소를 UUID 로 사전 검증한다.
  // 이 배열은 reorderByCase 헬퍼의 `${a.id}::uuid` raw SQL 캐스트로 흘러가는데
  // UUID 형식이 아닌 값이 도달하면 Postgres cast error 로 raw ID 가 Vercel Logs 에
  // 노출될 수 있으므로 사전 차단한다.
  const parsedIds = z.array(z.uuid()).min(1).safeParse(orderedIds);
  if (!parsedIds.success) {
    return { success: false, message: "유효하지 않은 요청입니다." };
  }
  const validIds = parsedIds.data;

  try {
    const { affected } = await reorderByCase({
      table: alumniStories,
      idColumn: alumniStories.id,
      targetColumn: alumniStories.order,
      // 기존 로직 유지: order 는 1-based (1, 2, 3, ...)
      assignments: validIds.map((id, index) => ({ id, value: index + 1 })),
    });

    // 존재하지 않는 ID 또는 중복 ID 로 인해 일부만 갱신된 경우 방어
    if (affected !== validIds.length) {
      logServerError("alumni/reorder", new Error("update count mismatch"), {
        expected: validIds.length,
        actual: affected,
      });
      return { success: false, message: "일부 항목을 저장하지 못했습니다." };
    }
  } catch (err) {
    logServerError("alumni/reorder", err);
    return { success: false, message: "순서를 저장하지 못했습니다. 다시 시도해주세요." };
  }

  revalidateAlumniPaths();
  return { success: true, message: "순서를 저장했습니다." };
}

export async function deleteAlumniStory(id: string): Promise<void> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  try {
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
  } catch (error) {
    logServerError("alumni/delete", error, { id: parsedId.data });
    // 서버 액션 void 반환형이라 에러 발생 시 redirect 등으로 처리하거나 에러를 던질 수 있음
    throw new Error("삭제 중 오류가 발생했습니다.");
  }
  
  revalidateAlumniPaths();
}
