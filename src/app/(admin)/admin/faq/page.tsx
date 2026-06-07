// FAQ 질문·답변 관리 목록 페이지 (관리자 전용)
// FAQ 항목 목록(드래그앤드롭 순서 변경)과 연락처 설정을 한 페이지에서 관리합니다.

import Link from "next/link";
import { asc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faqItems } from "@/lib/db/schema";
import { FaqContactForm } from "./_components/faq-contact-form";
import { FaqSortableList } from "./_components/faq-sortable-list";

export const dynamic = "force-dynamic";

export default async function AdminFaqPage() {
  await requireAdmin();

  // order 오름차순, 동일 order는 생성일 오름차순으로 초기 정렬
  const items = await db
    .select()
    .from(faqItems)
    .orderBy(asc(faqItems.order), asc(faqItems.createdAt));

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-4 py-6 sm:px-6 sm:py-10">
      {/* 연락처 설정 — 페이지 최상단 */}
      <FaqContactForm />

      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">FAQ 관리</h1>
        <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]" render={<Link href="/admin/faq/new" />}>
          <Plus className="mr-1 size-4" />
          새 질문 추가
        </Button>
      </div>

      {/* FAQ 항목 목록 — key를 items.length에 연결해 항목 추가 후 서버 재렌더 시 상태 초기화 */}
      <FaqSortableList key={items.length} initialItems={items} />
    </section>
  );
}
