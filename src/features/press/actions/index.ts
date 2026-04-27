"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
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
  order: z.coerce
    .number({ message: "순서는 숫자여야 합니다." })
    .int("순서는 정수여야 합니다."),
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
    order: normalizeText(formData.get("order")) || "0",
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

  await db.insert(pressArticles).values({
    title: parsed.data.title,
    source: parsed.data.source,
    url: parsed.data.url,
    publishedAt: new Date(parsed.data.publishedAt),
    description: parsed.data.description ?? null,
    imageUrl: parsed.data.imageUrl ?? null,
    order: parsed.data.order,
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
      order: parsed.data.order,
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

  await db.delete(pressArticles).where(eq(pressArticles.id, parsedId.data));
  revalidatePressPaths();
}

export async function trackPressView(id: string) {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) return;

  await db
    .update(pressArticles)
    .set({ viewCount: sql`${pressArticles.viewCount} + 1` })
    .where(eq(pressArticles.id, parsedId.data));
}
