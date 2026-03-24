import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { cohorts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모집안내",
};

const processSteps = [
  { step: "STEP 1", title: "지원서 작성", subtitle: "Write Application" },
  { step: "STEP 2", title: "서류 심사", subtitle: "Document Review" },
  { step: "STEP 3", title: "면접", subtitle: "Interview" },
  { step: "STEP 4", title: "최종 합격", subtitle: "Final Acceptance" },
] as const;

const statusMap = {
  UPCOMING: {
    label: "예정",
    className: "border-blue-300/50 bg-blue-500/15 text-blue-100",
  },
  OPEN: {
    label: "접수중",
    className: "border-emerald-300/50 bg-emerald-500/20 text-emerald-100",
  },
  CLOSED: {
    label: "마감",
    className: "border-zinc-300/30 bg-zinc-500/20 text-zinc-200",
  },
} as const;

const formatDate = (value: Date | null) => {
  if (!value) {
    return null;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
};

export default async function RecruitmentPage() {
  const activeCohorts = await db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      description: cohorts.description,
      recruitmentStatus: cohorts.recruitmentStatus,
      recruitmentStartDate: cohorts.recruitmentStartDate,
      recruitmentEndDate: cohorts.recruitmentEndDate,
    })
    .from(cohorts)
    .where(eq(cohorts.isActive, true))
    .orderBy(asc(cohorts.order), asc(cohorts.createdAt));

  return (
    <div className="mx-auto max-w-7xl px-6 py-20 md:py-32">
      <section className="mb-16 space-y-4">
        <Badge
          variant="outline"
          className="border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
        >
          HRA RECRUITMENT
        </Badge>
        <h1 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">
          모집안내
        </h1>
        <p className="max-w-3xl text-sm text-zinc-300 md:text-base">
          HRA는 성장에 진심인 사람을 기다립니다. 아래 절차를 확인하고 원하는 기수에
          지원해보세요.
        </p>
      </section>

      <section className="mb-16 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {processSteps.map((item) => (
          <Card key={item.step} className="border-white/10 bg-zinc-950/80 py-0">
            <CardHeader className="space-y-2 pb-3 pt-5">
              <Badge variant="outline" className="w-fit border-white/20 bg-white/5 text-zinc-200">
                {item.step}
              </Badge>
              <CardTitle className="text-lg text-white">{item.title}</CardTitle>
            </CardHeader>
            <CardContent className="pb-5 text-sm text-zinc-400">
              {item.subtitle}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="space-y-4">
        {activeCohorts.length === 0 ? (
          <Card className="border-white/10 bg-zinc-950/80 py-10">
            <CardContent className="text-center text-zinc-300">
              현재 등록된 모집 기수가 없습니다.
            </CardContent>
          </Card>
        ) : (
          activeCohorts.map((cohort) => {
            const status = statusMap[cohort.recruitmentStatus];
            const startDate = formatDate(cohort.recruitmentStartDate);
            const endDate = formatDate(cohort.recruitmentEndDate);

            return (
              <Card key={cohort.id} className="border-white/10 bg-zinc-950/80 py-0">
                <CardContent className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-white md:text-2xl">
                        {cohort.name}
                      </h2>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    {cohort.description ? (
                      <p className="text-sm text-zinc-300 md:text-base">{cohort.description}</p>
                    ) : null}
                    <div className="inline-flex items-center gap-2 text-xs text-zinc-400 md:text-sm">
                      <CalendarDays className="size-3.5" />
                      {startDate && endDate
                        ? `${startDate} - ${endDate}`
                        : "모집 일정 추후 공지"}
                    </div>
                  </div>

                  {cohort.recruitmentStatus === "OPEN" ? (
                    <Link href={`/recruitment/apply?cohort=${cohort.id}`}>
                      <Button className="h-10 bg-emerald-500 text-black hover:bg-emerald-400">
                        지원하기
                        <ArrowRight className="size-4" />
                      </Button>
                    </Link>
                  ) : null}
                </CardContent>
              </Card>
            );
          })
        )}
      </section>
    </div>
  );
}
