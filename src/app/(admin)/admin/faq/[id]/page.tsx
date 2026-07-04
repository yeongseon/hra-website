// FAQ 항목 수정 페이지 (관리자 전용)

import { notFound } from "next/navigation";
import { z } from "zod/v4";
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

  // Oracle Phase D BLOCK 수정 — z.uuid() 사전 검증으로 라우트 파라미터 leak 방지.
  // UUID 형식이 아닌 값이 DB 쿼리에 도달하면 Postgres cast error 로 raw ID 가
  // Vercel Logs 에 노출될 수 있으므로 사전 차단한다.
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const item = await getFaqItem(parsedId.data);

  if (!item) {
    notFound();
  }

  // item.id는 DB에서 조회된 검증된 값이므로 안전
  const action = updateFaqItem.bind(null, item.id);

  return (
    <FaqItemForm
      title="FAQ 항목 수정"
      submitLabel="저장"
      action={action}
      defaultValues={{
        question: item.question,
        answer: item.answer,
      }}
    />
  );
}
