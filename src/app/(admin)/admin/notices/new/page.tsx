import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NoticeForm } from "@/app/(admin)/admin/notices/_components/notice-form";
import { createNotice } from "@/features/notices/actions";
import { requireAdmin } from "@/lib/admin";

export default async function NewNoticePage() {
  await requireAdmin();

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">새 공지 작성</h1>
        <Button variant="outline" render={<Link href="/admin/notices" />}>
          목록으로
        </Button>
      </div>
      <NoticeForm action={createNotice} submitLabel="공지 저장" successMessage="공지사항이 생성되었습니다." />
    </section>
  );
}
