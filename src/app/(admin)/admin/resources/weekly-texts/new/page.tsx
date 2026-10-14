import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { WeeklyTextForm } from "@/app/(admin)/admin/resources/weekly-texts/_components/weekly-text-form";
import { createWeeklyText } from "@/features/weekly-texts/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
import { cohorts } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export default async function NewWeeklyTextPage() {
  const session = await requireAdmin();

  let cohortRows: Array<{ id: string; name: string }> = [];

  try {
    cohortRows = await db
      .select({ id: cohorts.id, name: cohorts.name })
      .from(cohorts)
      .orderBy(cohortNumberDesc(cohorts.name));
  } catch (error) {
    logServerError("admin/resources/weekly-texts/new", error);
  }

  return (
    <section className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">새 주차별 텍스트 추가</h1>
        <Button variant="outline" render={<Link href="/admin/resources/weekly-texts" />}>
          목록으로
        </Button>
      </div>

      <ResourcesTabNav />

      <WeeklyTextForm action={createWeeklyText} cohorts={cohortRows} userId={session.user.id} />
    </section>
  );
}
