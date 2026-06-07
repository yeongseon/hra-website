// 수료생 이야기 관리 목록 페이지 (관리자 전용)
// 드래그앤드롭으로 공개 페이지 표시 순서를 변경할 수 있습니다.

import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";
import { AlumniSortableList } from "./_components/alumni-sortable-list";

export const dynamic = "force-dynamic";

export default async function AdminAlumniPage() {
  await requireAdmin();

  // 고정된 항목 먼저, 그 다음 작성일 최신순
  const stories = await db
    .select({
      id: alumniStories.id,
      name: alumniStories.name,
      quote: alumniStories.quote,
      content: alumniStories.content,
      pinned: alumniStories.pinned,
    })
    .from(alumniStories)
    .orderBy(desc(alumniStories.pinned), desc(alumniStories.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">수료생 이야기 관리</h1>
        <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]" render={<Link href="/admin/alumni/new" />}>
          <Plus className="mr-1 size-4" />
          새 수료생 이야기 추가
        </Button>
      </div>

      <AlumniSortableList initialItems={stories} />
    </section>
  );
}
