/**
 * 공개 FAQ 화면입니다. FAQ 서비스에서 표시용 연락처와 질문 목록을 받아
 * 연락처 기본 문구와 클라이언트 컴포넌트의 최소 props를 구성합니다.
 */
import { FaqContent } from "./_components/faq-content";
import { getPublicContact, listPublicItems } from "@/features/faq/service";

export const dynamic = "force-dynamic";

export default async function FaqPage() {
  const contact = await getPublicContact();

  const contactText = contact
    ? `${contact.contactRole} ${contact.contactName} ${contact.contactPhone}`
    : "담당자 연락처가 아직 등록되지 않았습니다.";

  // 공개 목록 service는 정렬된 표시 필드 세 개만 반환합니다.
  const items = await listPublicItems();

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
