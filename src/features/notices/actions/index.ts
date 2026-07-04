"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { deleteBlobIfExists, deleteMarkdownBlobImages, extractMarkdownBlobUrls } from "@/lib/blob-utils";
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

  // 마크다운 임베드 이미지 orphan 정리용: 이전 본문 스냅샷을 확보한다.
  // 순서 원칙: DB update 성공 후에만 옛 URL 을 지운다. update 가 실패하면 옛 URL 은 여전히 참조 중이므로 절대 건드리지 않는다.
  const existing = await db.query.notices.findFirst({
    where: eq(notices.id, parsedId.data),
    columns: {
      content: true,
    },
  });

  if (!existing) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
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

  // DB update 성공 확정 후, 새 본문에서 사라진 임베드 이미지만 골라 best-effort cleanup.
  // 동시성 주의: 두 관리자가 동일 공지를 동시 편집하면 나중 저장자의 임베드가 오삭제될 수 있다.
  // neon-http 트랜잭션 미지원 + optimistic lock 미도입 상태에서 감수한다 (편집 빈도 낮음, 저장소 누수 감소가 우선).
  const oldUrls = extractMarkdownBlobUrls(existing.content);
  const newUrls = new Set(extractMarkdownBlobUrls(parsed.data.content));
  const removedUrls = oldUrls.filter((url) => !newUrls.has(url));
  await Promise.all(removedUrls.map((url) => deleteBlobIfExists(url)));

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
