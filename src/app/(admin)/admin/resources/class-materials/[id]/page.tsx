import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { ClassMaterialRowActions } from "@/app/(admin)/admin/resources/class-materials/_components/class-material-row-actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { classMaterials } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type AdminClassMaterialDetailPageProps = {
  params: Promise<{ id: string }>;
};

const formatAudience = (audience: string) => (audience === "FACULTY" ? "교수용" : "학생용");

export default async function AdminClassMaterialDetailPage({
  params,
}: AdminClassMaterialDetailPageProps) {
  await requireAdmin();

  const { id } = await params;
  const material = await db.query.classMaterials.findFirst({
    where: eq(classMaterials.id, id),
  });

  if (!material) {
    notFound();
  }

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">강의 자료 삭제 확인</h1>
        <Button variant="outline" render={<Link href="/admin/resources/class-materials" />}>
          목록으로
        </Button>
      </div>

      <ResourcesTabNav />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-6">
          <CardTitle className="text-xl text-slate-900">{material.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 py-6 text-sm text-slate-700">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <p className="font-medium text-slate-900">주차</p>
              <p>{material.weekNumber ?? "-"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">강의명</p>
              <p>{material.lectureTitle ?? "-"}</p>
            </div>
            <div>
              <p className="font-medium text-slate-900">대상</p>
              <p>{formatAudience(material.audience)}</p>
            </div>
          </div>
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-700">
            삭제 후에는 파일과 메타데이터를 모두 복구할 수 없습니다.
          </p>
          <div>
            <ClassMaterialRowActions id={material.id} />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
