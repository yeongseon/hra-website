// FAQ 새 질문 생성 페이지 (관리자 전용)

import { createFaqItem } from "@/features/faq/actions";
import { requireAdmin } from "@/lib/admin";
import { FaqItemForm } from "../_components/faq-item-form";

export const dynamic = "force-dynamic";

export default async function AdminFaqNewPage() {
  await requireAdmin();

  return (
    <FaqItemForm
      title="새 FAQ 항목 추가"
      submitLabel="추가"
      action={createFaqItem}
    />
  );
}
