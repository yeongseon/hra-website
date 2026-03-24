"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/admin";

const noticeFormSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력해주세요.").max(300),
  content: z.string().trim().min(1, "내용을 입력해주세요."),
  status: z.enum(["DRAFT", "PUBLISHED"]),
  pinned: z.boolean(),
});

const noticeIdSchema = z.uuid();

type NoticeActionState = {
  success: boolean;
  error?: string;
};

const parsePinned = (value: FormDataEntryValue | null) => {
  if (typeof value !== "string") {
    return false;
  }

  return value === "on" || value === "true";
};

const revalidateNoticePaths = () => {
  revalidatePath("/admin/notices");
  revalidatePath("/notices");
};

export async function createNotice(formData: FormData): Promise<NoticeActionState> {
  const session = await requireAdmin();

  const parsed = noticeFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    status: formData.get("status"),
    pinned: parsePinned(formData.get("pinned")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  try {
    await db.insert(notices).values({
      title: parsed.data.title,
      content: parsed.data.content,
      status: parsed.data.status,
      pinned: parsed.data.pinned,
      authorId: session.user.id,
    });

    revalidateNoticePaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "공지사항 생성에 실패했습니다.",
    };
  }
}

export async function updateNotice(id: string, formData: FormData): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  const parsed = noticeFormSchema.safeParse({
    title: formData.get("title"),
    content: formData.get("content"),
    status: formData.get("status"),
    pinned: parsePinned(formData.get("pinned")),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  try {
    await db
      .update(notices)
      .set({
        title: parsed.data.title,
        content: parsed.data.content,
        status: parsed.data.status,
        pinned: parsed.data.pinned,
      })
      .where(eq(notices.id, parsedId.data));

    revalidateNoticePaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "공지사항 수정에 실패했습니다.",
    };
  }
}

export async function deleteNotice(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  try {
    await db.delete(notices).where(eq(notices.id, parsedId.data));

    revalidateNoticePaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "공지사항 삭제에 실패했습니다.",
    };
  }
}

export async function togglePin(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  try {
    const [notice] = await db
      .select({ id: notices.id, pinned: notices.pinned })
      .from(notices)
      .where(eq(notices.id, parsedId.data))
      .limit(1);

    if (!notice) {
      return {
        success: false,
        error: "공지사항을 찾을 수 없습니다.",
      };
    }

    await db
      .update(notices)
      .set({ pinned: !notice.pinned })
      .where(eq(notices.id, parsedId.data));

    revalidateNoticePaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "고정 상태 변경에 실패했습니다.",
    };
  }
}

export async function toggleStatus(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = noticeIdSchema.safeParse(id);
  if (!parsedId.success) {
    return {
      success: false,
      error: "유효하지 않은 공지사항 ID입니다.",
    };
  }

  try {
    const [notice] = await db
      .select({ id: notices.id, status: notices.status })
      .from(notices)
      .where(eq(notices.id, parsedId.data))
      .limit(1);

    if (!notice) {
      return {
        success: false,
        error: "공지사항을 찾을 수 없습니다.",
      };
    }

    await db
      .update(notices)
      .set({ status: notice.status === "DRAFT" ? "PUBLISHED" : "DRAFT" })
      .where(eq(notices.id, parsedId.data));

    revalidateNoticePaths();

    return { success: true };
  } catch {
    return {
      success: false,
      error: "상태 변경에 실패했습니다.",
    };
  }
}
