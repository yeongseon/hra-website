"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faqContact } from "@/lib/db/schema";

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
