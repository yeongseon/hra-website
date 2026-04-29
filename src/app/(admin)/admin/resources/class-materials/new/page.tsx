import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { ClassMaterialForm } from "@/app/(admin)/admin/resources/class-materials/_components/class-material-form";
import { createClassMaterial } from "@/features/class-materials/actions";
import { requireAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function NewClassMaterialPage() {
  await requireAdmin();

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">새 강의 자료 추가</h1>
        <Button variant="outline" render={<Link href="/admin/resources/class-materials" />}>
          목록으로
        </Button>
      </div>

      <ResourcesTabNav />

      <ClassMaterialForm action={createClassMaterial} />
    </section>
  );
}
