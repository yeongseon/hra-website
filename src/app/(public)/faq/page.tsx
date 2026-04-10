import { eq } from "drizzle-orm";
import { FaqContent } from "./_components/faq-content";
import { db } from "@/lib/db";
import { faqContact } from "@/lib/db/schema";

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

  return <FaqContent contactText={contactText} />;
}
