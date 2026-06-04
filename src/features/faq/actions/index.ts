"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faqContact, faqItems } from "@/lib/db/schema";

const faqContactSchema = z.object({
  cohortName: z.string().trim().min(1, "기수명을 입력해주세요.").max(50, "기수명은 50자 이하여야 합니다."),
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
    cohortName: normalizeText(formData.get("cohortName")),
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
      cohortName: parsed.data.cohortName,
      contactName: parsed.data.contactName,
      contactPhone: parsed.data.contactPhone,
      contactRole: parsed.data.contactRole,
      isActive: true,
    });
  } else {
    await db
      .update(faqContact)
      .set({
        cohortName: parsed.data.cohortName,
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone,
        contactRole: parsed.data.contactRole,
        isActive: true,
      })
      .where(eq(faqContact.id, existingContact.id));
  }

  revalidatePath("/faq");
  revalidatePath("/admin/faq-contact");

  return {
    success: true,
    message: "FAQ 연락처를 저장했습니다.",
  };
}

// ============================================================
// FAQ 질문·답변 CRUD
// ============================================================

const faqItemSchema = z.object({
  question: z.string().trim().min(1, "질문을 입력해주세요.").max(500, "질문은 500자 이하여야 합니다."),
  answer: z.string().trim().min(1, "답변을 입력해주세요."),
  order: z.coerce.number().int().min(0).default(0),
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

// FAQ 항목 생성
export async function createFaqItem(formData: FormData): Promise<FaqItemActionState> {
  await requireAdmin();

  const parsed = faqItemSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
    order: formData.get("order"),
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

  await db.insert(faqItems).values(parsed.data);
  revalidatePath("/faq");
  revalidatePath("/admin/faq");
  redirect("/admin/faq");
}

// FAQ 항목 수정
export async function updateFaqItem(id: string, formData: FormData): Promise<FaqItemActionState> {
  await requireAdmin();

  const parsed = faqItemSchema.safeParse({
    question: formData.get("question"),
    answer: formData.get("answer"),
    order: formData.get("order"),
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
