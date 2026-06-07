"use server";

import { eq, max, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteBlobIfExists } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { pressArticles } from "@/lib/db/schema";

const pressArticleFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  source: z.string().trim().min(1, "언론사명을 입력해주세요.").max(200, "언론사명은 200자 이하여야 합니다."),
  url: z.url("올바른 기사 링크를 입력해주세요."),
  publishedAt: z.iso.date("올바른 게시일을 입력해주세요."),
  description: z.string().trim().max(5000, "요약은 5000자 이하여야 합니다.").optional(),
  imageUrl: z
    .union([z.literal(""), z.url("올바른 썸네일 URL을 입력해주세요.")])
    .optional(),
});

export type PressArticleActionState = {
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

function parsePressArticleFormData(formData: FormData) {
  return pressArticleFormSchema.safeParse({
    title: normalizeText(formData.get("title")),
    source: normalizeText(formData.get("source")),
    url: normalizeText(formData.get("url")),
    publishedAt: normalizeText(formData.get("publishedAt")),
    description: normalizeText(formData.get("description")) || undefined,
    imageUrl: normalizeText(formData.get("imageUrl")) || undefined,
  });
}

function revalidatePressPaths() {
  revalidatePath("/admin/press");
  revalidatePath("/press");
}

export async function createPressArticle(formData: FormData): Promise<PressArticleActionState> {
  await requireAdmin();

  const parsed = parsePressArticleFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  // 새 항목은 목록 맨 아래에 추가: 기존 최대 order + 1
  const [{ maxOrder }] = await db.select({ maxOrder: max(pressArticles.order) }).from(pressArticles);
  const nextOrder = (maxOrder ?? 0) + 1;

  await db.insert(pressArticles).values({
    title: parsed.data.title,
    source: parsed.data.source,
    url: parsed.data.url,
    publishedAt: new Date(parsed.data.publishedAt),
    description: parsed.data.description ?? null,
    imageUrl: parsed.data.imageUrl ?? null,
    order: nextOrder,
  });

  revalidatePressPaths();
  redirect("/admin/press");
}

export async function updatePressArticle(id: string, formData: FormData): Promise<PressArticleActionState> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 언론보도 ID입니다.",
    };
  }

  const parsed = parsePressArticleFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await db
    .update(pressArticles)
    .set({
      title: parsed.data.title,
      source: parsed.data.source,
      url: parsed.data.url,
      publishedAt: new Date(parsed.data.publishedAt),
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
    })
    .where(eq(pressArticles.id, parsedId.data));

  revalidatePressPaths();
  redirect("/admin/press");
}

export async function deletePressArticle(id: string): Promise<void> {
  await requireAdmin();

  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return;
  }

  const target = await db.query.pressArticles.findFirst({
    where: eq(pressArticles.id, parsedId.data),
    columns: {
      imageUrl: true,
    },
  });

  await deleteBlobIfExists(target?.imageUrl);

  await db.delete(pressArticles).where(eq(pressArticles.id, parsedId.data));
  revalidatePressPaths();
}

// 언론보도 순서 일괄 변경 — 드래그앤드롭 결과를 DB에 저장
// orderedIds: 새 순서대로 정렬된 언론보도 ID 배열
export async function reorderPressArticles(
  orderedIds: string[]
): Promise<{ success: boolean; message: string }> {
  await requireAdmin();

  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    return { success: false, message: "유효하지 않은 요청입니다." };
  }

  try {
    // neon-http 드라이버는 transaction()을 지원하지 않으므로 개별 쿼리로 순차 갱신
    for (const [index, id] of orderedIds.entries()) {
      await db
        .update(pressArticles)
        .set({ order: index + 1 })
        .where(eq(pressArticles.id, id));
    }
  } catch (err) {
    console.error("[press/reorder] 순서 변경 실패:", err);
    return { success: false, message: "순서를 저장하지 못했습니다. 다시 시도해주세요." };
  }

  revalidatePressPaths();
  return { success: true, message: "순서를 저장했습니다." };
}

export async function trackPressView(id: string) {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return;

  await db
    .update(pressArticles)
    .set({ viewCount: sql`${pressArticles.viewCount} + 1` })
    .where(eq(pressArticles.id, parsedId.data));
}
