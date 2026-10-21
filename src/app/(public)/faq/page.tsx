import { asc, eq } from "drizzle-orm";
import { FaqContent } from "./_components/faq-content";
import { db } from "@/lib/db";
import { faqContact, faqItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const [contact] = await db
    .select({
      contactRole: faqContact.contactRole,
      contactName: faqContact.contactName,
      contactPhone: faqContact.contactPhone,
    })
    .from(faqContact)
    .where(eq(faqContact.isActive, true))
    .limit(1);

  const contactText = contact
    ? `${contact.contactRole} ${contact.contactName} ${contact.contactPhone}`
    : "담당자 연락처가 아직 등록되지 않았습니다.";

  // DB에서 FAQ 항목 조회 (순서 오름차순, 화면 표시에 필요한 세 컬럼만 조회)
  const items = await db
    .select({
      id: faqItems.id,
      question: faqItems.question,
      answer: faqItems.answer,
    })
    .from(faqItems)
    .orderBy(asc(faqItems.order), asc(faqItems.createdAt));

  // 클라이언트 컴포넌트에는 표시용 세 필드만 명시적으로 전달합니다 (#272).
  return (
    <FaqContent
      contactText={contactText}
      items={items.map((item) => ({
        id: item.id,
        question: item.question,
        answer: item.answer,
      }))}
    />
  );
}
