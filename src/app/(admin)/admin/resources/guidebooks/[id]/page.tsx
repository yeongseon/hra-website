/**
 * 가이드북 수정 페이지
 *
 * 역할: 기존 가이드북의 제목을 변경하거나 파일을 교체한다.
 *       파일 교체 없이 제목만 수정할 수도 있다.
 * 사용 위치: /admin/resources/guidebooks/[id]
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { GuidebookForm } from "@/app/(admin)/admin/resources/guidebooks/_components/guidebook-form";
import { updateGuidebook } from "@/features/guidebooks/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { guidebooks } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditGuidebookPage({ params }: Props) {
  await requireAdmin();

  const { id } = await params;

  const guidebook = await db.query.guidebooks.findFirst({
    where: eq(guidebooks.id, id),
  });

  if (!guidebook) {
    notFound();
  }

  // id를 bind해서 action 시그니처를 (formData: FormData) => Promise<State>로 맞춤
  const boundAction = updateGuidebook.bind(null, id);

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">가이드북 수정</h1>
        <Button variant="outline" render={<Link href="/admin/resources/guidebooks" />}>
          목록으로
        </Button>
      </div>

      <ResourcesTabNav />

      <GuidebookForm
        action={boundAction}
        defaultValues={{ title: guidebook.title, fileName: guidebook.fileName }}
      />
    </section>
  );
}
