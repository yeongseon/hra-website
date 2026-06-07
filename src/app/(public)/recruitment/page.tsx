import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { CalendarDays, ExternalLink } from "lucide-react";
import { eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
import { db } from "@/lib/db";
import { cohorts, recruitmentSettings } from "@/lib/db/schema";
import { ProcessSteps } from "./_components/process-steps";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모집안내",
  description: "HRA 신규 기수 모집 일정과 지원 절차를 안내합니다. 인간 르네상스를 함께 꿈꿀 청년들을 기다립니다.",
};

// 모집 상태 배지 스타일 맵
const statusMap = {
  UPCOMING: { label: "예정", className: "border-blue-300 bg-blue-50 text-blue-700" },
  OPEN: { label: "접수 중", className: "border-emerald-300 bg-emerald-50 text-emerald-700" },
  CLOSED: { label: "마감", className: "border-gray-300 bg-gray-50 text-gray-600" },
} as const;

// 모집 시작일·종료일 기준으로 현재 상태를 동적 계산 (DB 저장값 미사용 — 날짜만 지나도 자동 반영)
function computeRecruitmentStatus(
  startDate: Date | null,
  deadlineDate: Date | null
): "UPCOMING" | "OPEN" | "CLOSED" {
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (deadlineDate) {
    const dlDay = new Date(Date.UTC(deadlineDate.getUTCFullYear(), deadlineDate.getUTCMonth(), deadlineDate.getUTCDate()));
    if (todayUTC > dlDay) return "CLOSED";
  }
  if (startDate) {
    const sdDay = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
    if (todayUTC >= sdDay) return "OPEN";
  }
  return "UPCOMING";
}

const formatDate = (value: Date | null) => {
  if (!value) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
};

export default async function RecruitmentPage() {
  // 모집 설정에서 activeCohortId와 모집 정보를 조회
  const [settings] = await db.select().from(recruitmentSettings).limit(1);

  // activeCohortId가 있으면 해당 기수 정보를 조회
  const activeCohort = settings?.activeCohortId
    ? await db
        .select({ id: cohorts.id, name: cohorts.name, description: cohorts.description })
        .from(cohorts)
        .where(eq(cohorts.id, settings.activeCohortId))
        .limit(1)
        .then((rows) => rows[0] ?? null)
    : null;

  const recruitmentStatus = computeRecruitmentStatus(
    settings?.recruitmentStartDate ?? null,
    settings?.deadlineDate ?? null
  );
  const status = statusMap[recruitmentStatus] ?? statusMap.UPCOMING;
  const startDate = formatDate(settings?.recruitmentStartDate ?? null);
  const endDate = formatDate(settings?.deadlineDate ?? null);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-16">
        <div className="flex items-center gap-3">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
          <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-6xl">
            모집안내
          </h1>
        </div>
        <p className="mt-4 max-w-3xl text-sm text-[#666666] md:text-base">
          HRA는 배우고 성장하고 싶은 모두를 환영합니다.
        </p>
      </section>

      <section className="mb-10 sm:mb-16">
        <ProcessSteps />
      </section>

      {/* 현재 모집 기수 배너 */}
      <section className="space-y-4">
        {!activeCohort ? (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
            <CardContent className="text-center text-[#666666]">
              현재 진행 중인 모집이 없습니다.
            </CardContent>
          </Card>
        ) : (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
            <CardContent className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-[#1a1a1a] md:text-2xl">{activeCohort.name}</h2>
                  <Badge variant="outline" className={status.className}>
                    {status.label}
                  </Badge>
                </div>
                {activeCohort.description ? (
                  <p className="text-sm text-[#666666] md:text-base">{activeCohort.description}</p>
                ) : null}
                <div className="inline-flex items-center gap-2 text-xs text-[#666666] md:text-sm">
                  <CalendarDays className="size-3.5" />
                  {startDate && endDate
                    ? `${startDate} ~ ${endDate}`
                    : startDate
                    ? `${startDate}부터`
                    : "모집 일정 추후 공지"}
                </div>
              </div>

              {/* 지원하기 버튼 — 모집중이고 구글폼 URL이 있을 때만 표시 */}
              {recruitmentStatus === "OPEN" && settings?.googleFormUrl ? (
                <div className="shrink-0">
                  <Button
                    className="bg-[#2563EB] text-white hover:bg-[#1d4ed8]"
                    render={
                      <Link href={settings.googleFormUrl} target="_blank" rel="noopener noreferrer" />
                    }
                  >
                    지원하기
                    <ExternalLink className="ml-2 size-4" />
                  </Button>
                </div>
              ) : null}
            </CardContent>
          </Card>
        )}
      </section>

      {/* 포스터 + 세부 안내 섹션 */}
      {(settings?.posterImageUrl || settings?.detailsMarkdown) && (() => {
        const layout = settings?.posterLayout ?? "right";
        const showPoster = !!settings?.posterImageUrl && layout !== "none";

        const posterEl = showPoster ? (
          <div className="shrink-0 lg:w-80 xl:w-96">
            <Image
              src={settings.posterImageUrl!}
              alt="모집 포스터"
              width={600}
              height={840}
              className="w-full rounded-2xl shadow-[var(--shadow-soft)]"
            />
          </div>
        ) : null;

        const detailsEl = settings?.detailsMarkdown ? (
          <div className="lg:flex-1">
            <MarkdownViewer body={settings.detailsMarkdown} />
          </div>
        ) : null;

        return (
          <section className="mt-16 sm:mt-24">
            <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-12">
              {layout === "left" ? <>{posterEl}{detailsEl}</> : <>{detailsEl}{posterEl}</>}
            </div>
          </section>
        );
      })()}
    </div>
  );
}
