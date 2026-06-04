import { asc, eq } from "drizzle-orm";
import { FaqContent } from "./_components/faq-content";
import { db } from "@/lib/db";
import { faqContact, faqItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const [contact] = await db
    .select()
    .from(faqContact)
    .where(eq(faqContact.isActive, true))
    .limit(1);

  const contactText = contact
    ? `${contact.cohortName} ${contact.contactRole} ${contact.contactName} ${contact.contactPhone}`
    : "20기 모집위원장 홍길동 010-0000-0000";

  // DB에서 FAQ 항목 조회 (순서 오름차순)
  const items = await db
    .select()
    .from(faqItems)
    .orderBy(asc(faqItems.order), asc(faqItems.createdAt));

  return <FaqContent contactText={contactText} items={items} />;
}
