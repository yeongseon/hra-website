import Link from "next/link";
import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { NoticeForm } from "@/app/(admin)/admin/notices/_components/notice-form";
import { updateNotice } from "@/features/notices/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

type NoticeEditPageProps = {
  params: Promise<{ id: string }>;
};

export default async function NoticeEditPage({ params }: NoticeEditPageProps) {
  await requireAdmin();

  const { id } = await params;
  const parsedId = z.uuid().safeParse(id);
  const noticeId = parsedId.success ? parsedId.data : null;

  if (!noticeId) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">공지사항을 찾을 수 없습니다.</CardContent>
        </Card>
      </section>
    );
  }

  const notice = await db.query.notices.findFirst({
    where: eq(notices.id, noticeId),
    columns: {
      title: true,
      status: true,
      pinned: true,
      content: true,
    },
  });

  if (!notice) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-10">
        <Card className="border-slate-200 bg-white">
          <CardContent className="py-10 text-center text-slate-600">공지사항을 찾을 수 없습니다.</CardContent>
        </Card>
      </section>
    );
  }

  const action = updateNotice.bind(null, noticeId);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">공지 수정</h1>
        <Button variant="outline" render={<Link href="/admin/notices" />}>
          목록으로
        </Button>
      </div>
      <NoticeForm
        action={action}
        defaultValues={{
          title: notice.title,
          content: notice.content,
          status: notice.status,
          pinned: notice.pinned,
        }}
        submitLabel="수정 저장"
        successMessage="공지사항이 수정되었습니다."
      />
    </section>
  );
}
