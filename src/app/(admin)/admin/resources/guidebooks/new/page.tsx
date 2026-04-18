import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { GuidebookForm } from "@/app/(admin)/admin/resources/guidebooks/_components/guidebook-form";
import { createGuidebook } from "@/features/guidebooks/actions";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewGuidebookPage() {
  await requireAdmin();

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">새 가이드북 추가</h1>
        <Button variant="outline" render={<Link href="/admin/resources/guidebooks" />}>
          목록으로
        </Button>
      </div>

      <ResourcesTabNav />

      <GuidebookForm action={createGuidebook} />
    </section>
  );
}
