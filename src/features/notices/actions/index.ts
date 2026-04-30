"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteMarkdownBlobImages } from "@/lib/blob-utils";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

const noticeFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300, "제목은 300자 이하여야 합니다."),
  content: z.string().trim().min(1, "내용을 입력해주세요."),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  pinned: z.boolean(),
});

export type NoticeActionState = {
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

function parsePinned(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return false;
  }

  return value === "on" || value === "true";
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

function parseNoticeFormData(formData: FormData) {
  return noticeFormSchema.safeParse({
    title: normalizeText(formData.get("title")),
    content: normalizeText(formData.get("content")),
    status: normalizeText(formData.get("status")),
    pinned: parsePinned(formData.get("pinned")),
  });
}

function parseNoticeId(id: string) {
  return z.uuid().safeParse(id);
}

function revalidateNoticePaths() {
  revalidatePath("/admin/notices");
  revalidatePath("/notices");
}

export async function createNotice(formData: FormData): Promise<NoticeActionState> {
  const session = await requireAdmin();

  const parsed = parseNoticeFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  await db.insert(notices).values({
    title: parsed.data.title,
    content: parsed.data.content,
    status: parsed.data.status,
    pinned: parsed.data.pinned,
    authorId: session.user.id,
  });

  revalidateNoticePaths();
  redirect("/admin/notices");
}

export async function updateNotice(id: string, formData: FormData): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const parsed = parseNoticeFormData(formData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const updatedRows = await db
    .update(notices)
    .set({
      title: parsed.data.title,
      content: parsed.data.content,
      status: parsed.data.status,
      pinned: parsed.data.pinned,
    })
    .where(eq(notices.id, parsedId.data))
    .returning({ id: notices.id });

  if (updatedRows.length === 0) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  revalidateNoticePaths();
  redirect("/admin/notices");
}

export async function deleteNotice(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const target = await db.query.notices.findFirst({
    where: eq(notices.id, parsedId.data),
    columns: {
      content: true,
    },
  });

  if (!target) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  await deleteMarkdownBlobImages(target.content);

  await db.delete(notices).where(eq(notices.id, parsedId.data));

  revalidateNoticePaths();
  return {
    success: true,
    message: "공지사항이 삭제되었습니다.",
  };
}

export async function togglePin(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const currentNotice = await db.query.notices.findFirst({
    where: eq(notices.id, parsedId.data),
    columns: {
      id: true,
      pinned: true,
    },
  });

  if (!currentNotice) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  await db
    .update(notices)
    .set({
      pinned: !currentNotice.pinned,
    })
    .where(eq(notices.id, currentNotice.id));

  revalidateNoticePaths();
  return {
    success: true,
    message: currentNotice.pinned ? "공지사항 고정을 해제했습니다." : "공지사항을 고정했습니다.",
  };
}

export async function toggleStatus(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const currentNotice = await db.query.notices.findFirst({
    where: eq(notices.id, parsedId.data),
    columns: {
      id: true,
      status: true,
    },
  });

  if (!currentNotice) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  await db
    .update(notices)
    .set({
      status: currentNotice.status === "DRAFT" ? "PUBLISHED" : "DRAFT",
    })
    .where(eq(notices.id, currentNotice.id));

  revalidateNoticePaths();
  return {
    success: true,
    message:
      currentNotice.status === "DRAFT"
        ? "공지사항을 게시했습니다."
        : "공지사항을 임시저장 상태로 변경했습니다.",
  };
}
