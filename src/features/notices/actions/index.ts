"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { createOrUpdateFile, deleteFile, getFile } from "@/lib/github";

const noticeFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300),
  content: z.string().trim().min(1, "내용을 입력해주세요."),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  pinned: z.boolean(),
});

const noticeSlugSchema = z.string().trim().min(1, "유효하지 않은 공지사항 슬러그입니다.");

type NoticeActionState = {
  success: boolean;
  error?: string;
};

type ParsedNoticeFile = {
  title: string;
  status: "DRAFT" | "PUBLISHED";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  content: string;
};

const parsePinned = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return false;
  }

  return value === "on" || value === "true";
};

const normalizeText = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return "";
  }

  return value;
};

const stripQuotes = (value: string): string => {
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");

  if (hasDoubleQuotes || hasSingleQuotes) {
    return value.slice(1, -1).trim();
  }

  return value;
};

const parseFrontmatter = (frontmatterText: string): Record<string, string> => {
  const map: Record<string, string> = {};

  for (const line of frontmatterText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const delimiterIndex = trimmed.indexOf(":");
    if (delimiterIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, delimiterIndex).trim();
    const rawValue = trimmed.slice(delimiterIndex + 1).trim();
    if (!key) {
      continue;
    }

    map[key] = stripQuotes(rawValue);
  }

  return map;
};

const parseNoticeMarkdown = (markdown: string): ParsedNoticeFile | null => {
  const normalized = markdown.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  if (lines[0] !== "---") {
    return null;
  }

  const closingDelimiterIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closingDelimiterIndex === -1) {
    return null;
  }

  const frontmatter = parseFrontmatter(lines.slice(1, closingDelimiterIndex).join("\n"));
  const status = frontmatter.status === "DRAFT" || frontmatter.status === "PUBLISHED" ? frontmatter.status : null;
  const title = frontmatter.title?.trim();
  const createdAt = frontmatter.createdAt?.trim();
  const updatedAt = frontmatter.updatedAt?.trim();

  if (!title || !status || !createdAt || !updatedAt) {
    return null;
  }

  return {
    title,
    status,
    pinned: frontmatter.pinned?.toLowerCase() === "true",
    createdAt,
    updatedAt,
    content: lines.slice(closingDelimiterIndex + 1).join("\n").trimStart(),
  };
};

const escapeFrontmatter = (value: string) => `"${value.replace(/"/g, '\\"')}"`;

const buildNoticeMarkdown = (input: {
  title: string;
  status: "DRAFT" | "PUBLISHED";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  content: string;
}) => {
  return [
    "---",
    `title: ${escapeFrontmatter(input.title)}`,
    `status: ${input.status}`,
    `pinned: ${input.pinned}`,
    `createdAt: ${input.createdAt}`,
    `updatedAt: ${input.updatedAt}`,
    "---",
    "",
    input.content.trim(),
    "",
  ].join("\n");
};

const generateSlug = (title: string) => {
  const base = title
    .replace(/[^가-힣a-zA-Z0-9]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

  return `${Date.now()}-${base || "notice"}`;
};

const revalidateNoticePaths = (slug?: string) => {
  revalidatePath("/admin/notices");
  revalidatePath("/notices");

  if (slug) {
    revalidatePath(`/notices/${slug}`);
  }
};

export async function createNotice(formData: FormData): Promise<NoticeActionState> {
  await requireAdmin();

  const parsed = noticeFormSchema.safeParse({
    title: normalizeText(formData.get("title")),
    content: normalizeText(formData.get("content")),
    status: normalizeText(formData.get("status")),
    pinned: parsePinned(formData.get("pinned")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const slug = generateSlug(parsed.data.title);
  const now = new Date().toISOString();
  const filePath = `content/notices/${slug}.md`;
  const markdown = buildNoticeMarkdown({
    title: parsed.data.title,
    content: parsed.data.content,
    status: parsed.data.status,
    pinned: parsed.data.pinned,
    createdAt: now,
    updatedAt: now,
  });

  const result = await createOrUpdateFile(filePath, markdown, `공지사항 생성: ${parsed.data.title}`);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "공지사항 생성에 실패했습니다.",
    };
  }

  revalidateNoticePaths(slug);
  redirect("/admin/notices");
}

export async function updateNotice(slug: string, formData: FormData): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedSlug = noticeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return {
      success: false,
      error: parsedSlug.error.issues[0]?.message ?? "유효하지 않은 공지사항 슬러그입니다.",
    };
  }

  const parsed = noticeFormSchema.safeParse({
    title: normalizeText(formData.get("title")),
    content: normalizeText(formData.get("content")),
    status: normalizeText(formData.get("status")),
    pinned: parsePinned(formData.get("pinned")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  const filePath = `content/notices/${parsedSlug.data}.md`;
  const existingFile = await getFile(filePath);
  if (!existingFile) {
    return {
      success: false,
      error: "공지사항을 찾을 수 없습니다.",
    };
  }

  const existing = parseNoticeMarkdown(existingFile.content);
  const createdAt = existing?.createdAt ?? new Date().toISOString();
  const markdown = buildNoticeMarkdown({
    title: parsed.data.title,
    content: parsed.data.content,
    status: parsed.data.status,
    pinned: parsed.data.pinned,
    createdAt,
    updatedAt: new Date().toISOString(),
  });

  const result = await createOrUpdateFile(
    filePath,
    markdown,
    `공지사항 수정: ${parsed.data.title}`,
    existingFile.sha,
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "공지사항 수정에 실패했습니다.",
    };
  }

  revalidateNoticePaths(parsedSlug.data);
  redirect("/admin/notices");
}

export async function deleteNotice(slug: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedSlug = noticeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return {
      success: false,
      error: parsedSlug.error.issues[0]?.message ?? "유효하지 않은 공지사항 슬러그입니다.",
    };
  }

  const filePath = `content/notices/${parsedSlug.data}.md`;
  const existingFile = await getFile(filePath);
  if (!existingFile) {
    return {
      success: false,
      error: "공지사항을 찾을 수 없습니다.",
    };
  }

  const result = await deleteFile(filePath, existingFile.sha, `공지사항 삭제: ${parsedSlug.data}`);
  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "공지사항 삭제에 실패했습니다.",
    };
  }

  revalidateNoticePaths(parsedSlug.data);
  return { success: true };
}

export async function togglePin(slug: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedSlug = noticeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return {
      success: false,
      error: parsedSlug.error.issues[0]?.message ?? "유효하지 않은 공지사항 슬러그입니다.",
    };
  }

  const filePath = `content/notices/${parsedSlug.data}.md`;
  const existingFile = await getFile(filePath);
  if (!existingFile) {
    return {
      success: false,
      error: "공지사항을 찾을 수 없습니다.",
    };
  }

  const parsedNotice = parseNoticeMarkdown(existingFile.content);
  if (!parsedNotice) {
    return {
      success: false,
      error: "공지사항 파일 형식이 올바르지 않습니다.",
    };
  }

  const markdown = buildNoticeMarkdown({
    ...parsedNotice,
    pinned: !parsedNotice.pinned,
    updatedAt: new Date().toISOString(),
  });

  const result = await createOrUpdateFile(
    filePath,
    markdown,
    `공지사항 고정 상태 변경: ${parsedNotice.title}`,
    existingFile.sha,
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "고정 상태 변경에 실패했습니다.",
    };
  }

  revalidateNoticePaths(parsedSlug.data);
  return { success: true };
}

export async function toggleStatus(slug: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedSlug = noticeSlugSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return {
      success: false,
      error: parsedSlug.error.issues[0]?.message ?? "유효하지 않은 공지사항 슬러그입니다.",
    };
  }

  const filePath = `content/notices/${parsedSlug.data}.md`;
  const existingFile = await getFile(filePath);
  if (!existingFile) {
    return {
      success: false,
      error: "공지사항을 찾을 수 없습니다.",
    };
  }

  const parsedNotice = parseNoticeMarkdown(existingFile.content);
  if (!parsedNotice) {
    return {
      success: false,
      error: "공지사항 파일 형식이 올바르지 않습니다.",
    };
  }

  const markdown = buildNoticeMarkdown({
    ...parsedNotice,
    status: parsedNotice.status === "DRAFT" ? "PUBLISHED" : "DRAFT",
    updatedAt: new Date().toISOString(),
  });

  const result = await createOrUpdateFile(
    filePath,
    markdown,
    `공지사항 상태 변경: ${parsedNotice.title}`,
    existingFile.sha,
  );

  if (!result.success) {
    return {
      success: false,
      error: result.error ?? "상태 변경에 실패했습니다.",
    };
  }

  revalidateNoticePaths(parsedSlug.data);
  return { success: true };
}
