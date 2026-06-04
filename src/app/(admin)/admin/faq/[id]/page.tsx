// FAQ 항목 수정 페이지 (관리자 전용)

import { notFound } from "next/navigation";
import { getFaqItem, updateFaqItem } from "@/features/faq/actions";
import { requireAdmin } from "@/lib/admin";
import { FaqItemForm } from "../_components/faq-item-form";

export const dynamic = "force-dynamic";

export default async function AdminFaqEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();

  const { id } = await params;
  const item = await getFaqItem(id);

  if (!item) {
    notFound();
  }

  // id를 bind하여 수정 액션 생성
  const action = updateFaqItem.bind(null, item.id);

  return (
    <FaqItemForm
      title="FAQ 항목 수정"
      submitLabel="저장"
      action={action}
      defaultValues={{
        question: item.question,
        answer: item.answer,
        order: item.order,
      }}
    />
  );
}
