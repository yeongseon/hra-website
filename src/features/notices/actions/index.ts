"use server";

/**
 * 관리자 공지사항 생성·수정·삭제와 고정·게시 상태 반전을 처리한다.
 * 반전은 요청마다 실행하는 명령이며, 반환 안내는 그 명령이 저장한 상태를 나타낸다.
 */
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
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

  // 존재 여부만 확인합니다. 본문 URL은 파일 소유권 증명이 아니므로 삭제에 사용하지 않습니다.
  const existing = await db.query.notices.findFirst({
    where: eq(notices.id, parsedId.data),
    columns: {
      id: true,
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
      id: true,
    },
  });

  if (!target) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  await db.delete(notices).where(eq(notices.id, parsedId.data));

  revalidateNoticePaths();
  return {
    success: true,
    message: "공지사항이 삭제되었습니다.",
  };
}

/**
 * 클릭마다 현재 DB 값을 한 번 반전한다. 재전송도 별도 반전이며 중복 실행 방지는 보장하지 않는다.
 * 응답은 해당 UPDATE의 저장값 기준이고, 이후 다른 명령으로 상태가 다시 바뀔 수 있다.
 */
export async function togglePin(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  // 행 잠금 획득 후의 최신 값을 SQL 안에서 반전해 동시 요청의 변경을 덮어쓰지 않는다.
  const [updated] = await db.update(notices)
    .set({ pinned: sql`NOT ${notices.pinned}` })
    .where(eq(notices.id, parsedId.data))
    .returning({ pinned: notices.pinned });

  if (!updated) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  revalidateNoticePaths();
  return {
    success: true,
    message: updated.pinned ? "공지사항을 고정했습니다." : "공지사항 고정을 해제했습니다.",
  };
}

/** 게시 반전도 요청마다 적용하며, 재전송·후속 명령의 의미는 togglePin과 동일하다. */
export async function toggleStatus(id: string): Promise<NoticeActionState> {
  await requireAdmin();

  const parsedId = parseNoticeId(id);
  if (!parsedId.success) {
    return {
      success: false,
      message: "잘못된 공지사항 ID입니다.",
    };
  }

  const [updated] = await db.update(notices)
    .set({ status: sql`CASE WHEN ${notices.status} = 'DRAFT'
      THEN 'PUBLISHED'::notice_status ELSE 'DRAFT'::notice_status END` })
    .where(eq(notices.id, parsedId.data))
    .returning({ status: notices.status });

  if (!updated) {
    return {
      success: false,
      message: "공지사항을 찾을 수 없습니다.",
    };
  }

  revalidateNoticePaths();
  return {
    success: true,
    message:
      updated.status === "PUBLISHED"
        ? "공지사항을 게시했습니다."
        : "공지사항을 임시저장 상태로 변경했습니다.",
  };
}
