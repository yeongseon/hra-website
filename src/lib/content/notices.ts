import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type NoticeMetadata = {
  slug: string;
  title: string;
  status: "DRAFT" | "PUBLISHED";
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoticeWithContent = NoticeMetadata & {
  content: string;
};

const noticesDirectoryPath = path.join(process.cwd(), "content", "notices");

type FrontmatterMap = Record<string, string>;

function stripQuotes(value: string): string {
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");

  if (hasDoubleQuotes || hasSingleQuotes) {
    return value.slice(1, -1).trim();
  }

  return value;
}

function parseSimpleFrontmatter(frontmatterText: string): FrontmatterMap {
  const result: FrontmatterMap = {};
  const lines = frontmatterText.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      continue;
    }

    const delimiterIndex = trimmedLine.indexOf(":");
    if (delimiterIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, delimiterIndex).trim();
    const rawValue = trimmedLine.slice(delimiterIndex + 1).trim();
    const value = stripQuotes(rawValue);

    if (key.length === 0) {
      continue;
    }

    result[key] = value;
  }

  return result;
}

function toNoticeStatus(value: string | undefined): "DRAFT" | "PUBLISHED" | null {
  if (value === "DRAFT" || value === "PUBLISHED") {
    return value;
  }

  return null;
}

function parsePinned(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function parseNoticeFile(fileText: string, slug: string): NoticeWithContent | null {
  const normalizedText = fileText.replace(/\r\n/g, "\n");
  const lines = normalizedText.split("\n");

  if (lines[0] !== "---") {
    return null;
  }

  const closingDelimiterIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");

  if (closingDelimiterIndex === -1) {
    return null;
  }

  const frontmatterText = lines.slice(1, closingDelimiterIndex).join("\n");
  const bodyText = lines.slice(closingDelimiterIndex + 1).join("\n").trimStart();
  const frontmatter = parseSimpleFrontmatter(frontmatterText);

  const title = frontmatter.title?.trim();
  const status = toNoticeStatus(frontmatter.status);
  const createdAt = frontmatter.createdAt?.trim();
  const updatedAt = frontmatter.updatedAt?.trim();

  if (!title || !status || !createdAt || !updatedAt) {
    return null;
  }

  return {
    slug,
    title,
    status,
    pinned: parsePinned(frontmatter.pinned),
    createdAt,
    updatedAt,
    content: bodyText,
  };
}

function compareNoticeSortOrder(a: NoticeMetadata, b: NoticeMetadata): number {
  if (a.pinned !== b.pinned) {
    return a.pinned ? -1 : 1;
  }

  const timeA = Date.parse(a.createdAt);
  const timeB = Date.parse(b.createdAt);

  const normalizedA = Number.isNaN(timeA) ? 0 : timeA;
  const normalizedB = Number.isNaN(timeB) ? 0 : timeB;

  return normalizedB - normalizedA;
}

async function readAllNoticeMetadata(includeDraft: boolean): Promise<NoticeMetadata[]> {
  try {
    const entries = await readdir(noticesDirectoryPath);
    const noticeFileNames = entries.filter((entry) => entry.endsWith(".md"));

    const notices = await Promise.all(
      noticeFileNames.map(async (fileName) => {
        const slug = fileName.replace(/\.md$/, "");
        const filePath = path.join(noticesDirectoryPath, fileName);
        const fileText = await readFile(filePath, "utf8");

        const parsed = parseNoticeFile(fileText, slug);
        if (!parsed) {
          return null;
        }

        if (!includeDraft && parsed.status !== "PUBLISHED") {
          return null;
        }

        const { content: _ignoredContent, ...metadata } = parsed;
        return metadata;
      }),
    );

    return notices.filter((notice): notice is NoticeMetadata => notice !== null).sort(compareNoticeSortOrder);
  } catch {
    return [];
  }
}

export async function getAllNotices(): Promise<NoticeMetadata[]> {
  return readAllNoticeMetadata(false);
}

export async function getAllNoticesUnfiltered(): Promise<NoticeMetadata[]> {
  return readAllNoticeMetadata(true);
}

export async function getNoticeBySlug(slug: string): Promise<NoticeWithContent | null> {
  try {
    const filePath = path.join(noticesDirectoryPath, `${slug}.md`);
    const fileText = await readFile(filePath, "utf8");
    const notice = parseNoticeFile(fileText, slug);

    if (!notice || notice.status !== "PUBLISHED") {
      return null;
    }

    return notice;
  } catch {
    return null;
  }
}
