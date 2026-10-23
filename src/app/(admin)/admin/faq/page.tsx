/**
 * 관리자 FAQ 목록 화면입니다. 관리자 세션을 확인한 뒤 FAQ 서비스의 정렬 목록을
 * 최소 props로 전달하고 연락처 설정과 질문 순서 변경 화면을 구성합니다.
 */

import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listAdminItems } from "@/features/faq/service";
import { requireAdmin } from "@/lib/admin";
import { FaqContactForm } from "./_components/faq-contact-form";
import { FaqSortableList } from "./_components/faq-sortable-list";

export const dynamic = "force-dynamic";

export default async function AdminFaqPage() {
  const session = await requireAdmin();

  // 서비스가 관리자 주체를 확인하고 정렬된 표시 필드 네 개만 반환합니다.
  const items = await listAdminItems({ userId: session.user.id, role: session.user.role });

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
      <FaqSortableList
        key={items.length}
        initialItems={items.map((item) => ({
          id: item.id,
          question: item.question,
          answer: item.answer,
          order: item.order,
        }))}
      />
    </section>
  );
}
