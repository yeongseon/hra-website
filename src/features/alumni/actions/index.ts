"use server";

import { put } from "@vercel/blob";
import { and, eq, isNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { reorderByCase } from "@/lib/db/reorder";
import { alumniStories, alumniStoryImages } from "@/lib/db/schema";
import { recordOwnedBlob } from "@/lib/owned-blob";
import { logServerError } from "@/lib/errors";
import { cleanupCreatedBlobs, uploadBlobsForCreate } from "@/lib/create-with-blobs";
import { validateAlumniImageReference } from "@/lib/alumni-upload-server";

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
  const files = formData.getAll("images").filter((entry): entry is File => entry instanceof File);
  const validFiles: File[] = [];
  let totalBytes = 0;

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
    totalBytes += file.size;
    validFiles.push(file);
  }

  // 구형 서버 경유 요청은 플랫폼 본문 한도 아래에서만 허용합니다.
  if (totalBytes > 3 * 1024 * 1024) {
    return { success: false as const, message: "사진을 다시 선택해 업로드해주세요.", fieldErrors: { images: "사진을 다시 선택해 업로드해주세요." } };
  }

  return { success: true as const, files: validFiles };
}

/** 브라우저 완료 URL은 전달 문자열을 신뢰하지 않고 업로드 실물과 소유자를 재확인합니다. */
async function getUploadedImageUrls(formData: FormData, storyId: string, userId: string): Promise<{ urls: string[] } | { error: string }> {
  const raw = formData.get("uploadedImageUrls");
  if (raw === null) return { urls: [] };
  if (typeof raw !== "string" || raw.length > 100_000) return { error: "업로드한 사진 정보를 확인해주세요." };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: "업로드한 사진 정보를 확인해주세요." };
  }
  const urls = z.array(z.url()).max(100).safeParse(parsed);
  if (!urls.success || new Set(urls.data).size !== urls.data.length) return { error: "업로드한 사진 정보를 확인해주세요." };
  for (const url of urls.data) {
    if (!await validateAlumniImageReference(storyId, userId, url)) return { error: "업로드한 사진을 확인할 수 없습니다. 다시 업로드해주세요." };
  }
  return { urls: urls.data };
}

async function uploadAlumniImage(file: File, uploadedById: string) {
  const timestamp = Date.now();
  const safeFileName = `${timestamp}-${file.name.replace(/\s+/g, "-")}`;
  const blob = await put(`alumni/${safeFileName}`, file, { access: "public", addRandomSuffix: true });
  await recordOwnedBlob(blob.url, uploadedById);
  return blob.url;
}

function revalidateAlumniPaths() {
  revalidatePath("/");
  revalidatePath("/admin/alumni");
  revalidatePath("/alumni");
}

export async function createAlumniStory(formData: FormData): Promise<AlumniStoryActionState> {
  const session = await requireAdmin();

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

  const requestId = z.uuid().safeParse(formData.get("requestId"));
  if (!requestId.success) {
    return { success: false, message: "페이지를 새로고침한 뒤 다시 제출해주세요." };
  }

  const directImages = await getUploadedImageUrls(formData, requestId.data, session.user.id);
  if ("error" in directImages) return { success: false, message: directImages.error, fieldErrors: { images: directImages.error } };

  try {
    const id = requestId.data;
    const [alreadyCreated] = await db.select({ id: alumniStories.id }).from(alumniStories).where(eq(alumniStories.id, id)).limit(1);
    if (!alreadyCreated) {
      // 새 항목은 목록 맨 아래에 추가합니다.
      const [{ maxOrder }] = await db.select({ maxOrder: max(alumniStories.order) }).from(alumniStories);
      const nextOrder = (maxOrder ?? 0) + 1;
      const legacyUrls = await uploadBlobsForCreate(
        validatedImages.files.map((file, index) => ({
          pathname: `alumni/${id}-${index}-${file.name.replace(/\s+/g, "-")}`,
          file,
        })),
        session.user.id,
      );
      const uploadedUrls = [...legacyUrls, ...directImages.urls];

      try {
        // 글과 이미지 메타를 한 배치에 넣어 후반부 실패 시 글도 롤백합니다.
        const insertStory = db.insert(alumniStories).values({
          id,
          name: parsed.data.name,
          title: parsed.data.title ?? null,
          quote: parsed.data.quote,
          content: parsed.data.content,
          imageUrl: parsed.data.imageUrl || uploadedUrls[0] || null,
          isFeatured: parsed.data.isFeatured,
          order: nextOrder,
        });
        if (uploadedUrls.length > 0) {
          await db.batch([
            insertStory,
            db.insert(alumniStoryImages).values(uploadedUrls.map((url, index) => ({
              alumniStoryId: id,
              url,
              order: index,
            }))),
          ]);
        } else {
          await insertStory;
        }
      } catch (error) {
        // 커밋 후 응답 유실 가능성을 확인한 뒤 미참조 Blob만 정리합니다.
        const [existing] = await db.select({ id: alumniStories.id }).from(alumniStories).where(eq(alumniStories.id, id)).limit(1);
        if (!existing) {
          await cleanupCreatedBlobs(legacyUrls);
          throw error;
        }
        const referenced = uploadedUrls.length > 0
          ? await db.select({ url: alumniStoryImages.url }).from(alumniStoryImages).where(eq(alumniStoryImages.alumniStoryId, id))
          : [];
        const referencedUrls = new Set(referenced.map((row) => row.url));
        await cleanupCreatedBlobs(legacyUrls.filter((url) => !referencedUrls.has(url)));
      }
    }
  } catch (error) {
    logServerError("alumni/create", error);
    return {
      success: false,
      message: "수료생 이야기 저장에 실패했습니다. 잠시 후 다시 시도해주세요.",
    };
  }

  revalidateAlumniPaths();
  redirect("/admin/alumni");
}

export async function updateAlumniStory(id: string, formData: FormData): Promise<AlumniStoryActionState> {
  const session = await requireAdmin();

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

  const directImages = await getUploadedImageUrls(formData, parsedId.data, session.user.id);
  if ("error" in directImages) return { success: false, message: directImages.error, fieldErrors: { images: directImages.error } };

  try {
    const [existing] = await db
      .select({ imageUrl: alumniStories.imageUrl })
      .from(alumniStories)
      .where(eq(alumniStories.id, parsedId.data));
    if (!existing) {
      return { success: false, message: "수료생 이야기를 찾을 수 없습니다." };
    }

    const uploadedUrls: string[] = [...directImages.urls];
    for (const file of validatedImages.files) {
      const url = await uploadAlumniImage(file, session.user.id);
      uploadedUrls.push(url);
    }

    // 대표 이미지가 먼저 바뀌었다면 최신 값을 덮어쓰지 않습니다.
    // 이 요청에서 새로 올린 미참조 파일은 소유권 원장이 나중에 정리합니다.
    const [updated] = await db
      .update(alumniStories)
      .set({
        name: parsed.data.name,
        title: parsed.data.title ?? null,
        quote: parsed.data.quote,
        content: parsed.data.content,
        // 새 이미지의 첫 파일을 대표 사진으로 지정하고, 업로드가 없으면 기존 사진을 유지합니다.
        imageUrl: uploadedUrls[0] || parsed.data.imageUrl || existing.imageUrl,
        isFeatured: parsed.data.isFeatured,
      })
      .where(and(
        eq(alumniStories.id, parsedId.data),
        existing.imageUrl
          ? eq(alumniStories.imageUrl, existing.imageUrl)
          : isNull(alumniStories.imageUrl),
      ))
      .returning({ id: alumniStories.id });
    if (!updated) {
      return { success: false, message: "수료생 이야기 정보가 변경됐습니다. 새로고침 후 다시 시도해주세요." };
    }

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
    // 기존 이미지 URL만으로 파일 소유권을 증명할 수 없으므로 DB 삭제 전에
    // Blob을 지우지 않습니다. 미확인 파일은 보존합니다 (#93).
    await db.delete(alumniStories).where(eq(alumniStories.id, parsedId.data));
  } catch (error) {
    logServerError("alumni/delete", error, { id: parsedId.data });
    // 서버 액션 void 반환형이라 에러 발생 시 redirect 등으로 처리하거나 에러를 던질 수 있음
    throw new Error("삭제 중 오류가 발생했습니다.");
  }
  
  revalidateAlumniPaths();
}
