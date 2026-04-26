import { and, asc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import ApplyForm from "./_components/apply-form";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";

export default async function RecruitmentApplyPage(props: PageProps<"/recruitment/apply">) {
  const searchParams = await props.searchParams;
  const cohortParam = searchParams.cohort;
  const cohortId = typeof cohortParam === "string" ? cohortParam : "";

  if (!cohortId) {
    const [openCohort] = await db
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(
        and(eq(cohorts.recruitmentStatus, "OPEN"), eq(cohorts.isActive, true))
      )
      .orderBy(asc(cohorts.order), asc(cohorts.createdAt))
      .limit(1);

    if (!openCohort) {
      return (
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
          <section className="mb-8 space-y-4 sm:mb-10">
            <Badge
              variant="outline"
              className="border-emerald-300 bg-emerald-50 text-emerald-700"
            >
              비회원 지원
            </Badge>
            <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
              지원서 작성
            </h1>
            <p className="max-w-2xl text-sm text-[#666666] md:text-base">
              현재 모집 중인 기수가 없습니다.
            </p>
          </section>

          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
            <CardHeader className="border-b border-[#D9D9D9] py-6">
              <CardTitle className="text-xl text-[#1a1a1a] md:text-2xl">
                모집 상태 안내
              </CardTitle>
            </CardHeader>
            <CardContent className="py-6 text-sm leading-6 text-[#666666]">
              지원 가능한 기수가 열리면 이 페이지에서 바로 지원하실 수 있습니다.
            </CardContent>
          </Card>
        </div>
      );
    }

    return <ApplyForm cohortId={openCohort.id} />;
  }

  return <ApplyForm cohortId={cohortId} />;
}
