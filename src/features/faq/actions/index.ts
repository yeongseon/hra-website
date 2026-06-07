"use server";

import { asc, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faqContact, faqItems } from "@/lib/db/schema";

const faqContactSchema = z.object({
  contactName: z.string().trim().min(1, "담당자명을 입력해주세요.").max(100, "담당자명은 100자 이하여야 합니다."),
  contactPhone: z.string().trim().min(1, "연락처를 입력해주세요.").max(20, "연락처는 20자 이하여야 합니다."),
  contactRole: z.string().trim().min(1, "역할을 입력해주세요.").max(100, "역할은 100자 이하여야 합니다."),
});

export type FaqContactActionState = {
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

export async function getFaqContact() {
  await requireAdmin();

  const [contact] = await db
    .select()
    .from(faqContact)
    .where(eq(faqContact.isActive, true))
    .limit(1);

  return contact ?? null;
}

export async function updateFaqContact(formData: FormData): Promise<FaqContactActionState> {
  await requireAdmin();

  const parsed = faqContactSchema.safeParse({
    contactName: normalizeText(formData.get("contactName")),
    contactPhone: normalizeText(formData.get("contactPhone")),
    contactRole: normalizeText(formData.get("contactRole")),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      success: false,
      message: firstIssue?.message ?? "입력값을 확인해주세요.",
      fieldErrors: issuesToFieldErrors(parsed.error.issues),
    };
  }

  const [existingContact] = await db
    .select({ id: faqContact.id })
    .from(faqContact)
    .where(eq(faqContact.isActive, true))
    .limit(1);

  if (!existingContact) {
    await db.insert(faqContact).values({
      cohortName: "",
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      contactRole: parsed.data.contactRole,
      isActive: true,
    });
  } else {
    await db
      .update(faqContact)
      .set({
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone,
        contactRole: parsed.data.contactRole,
        isActive: true,
      })
      .where(eq(faqContact.id, existingContact.id));
  }

  revalidatePath("/faq");
  revalidatePath("/admin/faq");

  return {
    success: true,
    message: "FAQ 연락처를 저장했습니다.",
  };
}

// ============================================================
// FAQ 질문·답변 CRUD
// ============================================================

// order 필드는 폼에서 제거 — 드래그앤드롭으로 순서 관리
const faqItemSchema = z.object({
  question: z.string().trim().min(1, "질문을 입력해주세요.").max(500, "질문은 500자 이하여야 합니다."),
  answer: z.string().trim().min(1, "답변을 입력해주세요."),
});

export type FaqItemActionState = {
  success: boolean;
  message: string;
  fieldErrors?: Record<string, string>;
};

// FAQ 항목 전체 조회 (공개·관리자 공용)
export async function getAllFaqItems() {
  return db
    .select()
    .from(faqItems)
    .orderBy(asc(faqItems.order), asc(faqItems.createdAt));
}

// FAQ 항목 단건 조회 (관리자 편집용)
export async function getFaqItem(id: string) {
  await requireAdmin();

  const [item] = await db.select().from(faqItems).where(eq(faqItems.id, id)).limit(1);
  return item ?? null;
}

// FAQ 항목 생성 — 순서는 기존 최댓값 + 1로 자동 지정 (새 항목은 목록 맨 아래로)
export async function createFaqItem(formData: FormData): Promise<FaqItemActionState> {
  await requireAdmin();

  const parsed = faqItemSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues
          .filter((i) => i.path.length > 0)
          .map((i) => [String(i.path[0]), i.message])
      ),
    };
  }

  // 기존 항목 중 가장 큰 order 값을 조회하여 그보다 1 큰 값으로 설정
  const [{ maxOrder }] = await db.select({ maxOrder: max(faqItems.order) }).from(faqItems);
  const nextOrder = (maxOrder ?? 0) + 1;

  await db.insert(faqItems).values({ ...parsed.data, order: nextOrder });
  revalidatePath("/faq");
  revalidatePath("/admin/faq");
  redirect("/admin/faq");
}

// FAQ 항목 수정 — 순서(order)는 드래그앤드롭으로 관리하므로 수정하지 않음
export async function updateFaqItem(id: string, formData: FormData): Promise<FaqItemActionState> {
  await requireAdmin();

  const parsed = faqItemSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
  });

  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
      fieldErrors: Object.fromEntries(
        parsed.error.issues
          .filter((i) => i.path.length > 0)
          .map((i) => [String(i.path[0]), i.message])
      ),
    };
  }

  await db.update(faqItems).set(parsed.data).where(eq(faqItems.id, id));
  revalidatePath("/faq");
  revalidatePath("/admin/faq");
  redirect("/admin/faq");
}

// FAQ 항목 삭제
export async function deleteFaqItem(id: string): Promise<void> {
  await requireAdmin();

  await db.delete(faqItems).where(eq(faqItems.id, id));
  revalidatePath("/faq");
  revalidatePath("/admin/faq");
}

// FAQ 항목 순서 일괄 변경 — 드래그앤드롭 결과를 저장
// orderedIds: 새 순서대로 정렬된 FAQ 항목 ID 배열
export async function reorderFaqItems(
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
        .update(faqItems)
        .set({ order: index + 1 })
        .where(eq(faqItems.id, id));
    }
  } catch (err) {
    console.error("[faq/reorder] 순서 변경 실패:", err);
    return { success: false, message: "순서를 저장하지 못했습니다. 다시 시도해주세요." };
  }

  revalidatePath("/faq");
  revalidatePath("/admin/faq");
  return { success: true, message: "순서를 저장했습니다." };
}
