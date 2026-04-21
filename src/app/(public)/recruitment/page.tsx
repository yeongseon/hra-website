import type { Metadata } from "next";
import Image from "next/image";
import { CalendarDays, ImageIcon } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { cohorts, recruitmentSettings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모집안내",
  description: "HRA 신규 기수 모집 일정과 지원 절차를 안내합니다. 인간 르네상스를 함께 꿈꿀 청년들을 기다립니다.",
};

const processSteps = [
  {
    step: "STEP 1",
    title: "지원서 접수",
    description:
      "홈페이지 내 온라인 지원서를 작성하여 제출합니다. 자기소개, 지원 동기, 향후 계획 등의 항목을 성실하게 작성해 주세요.",
  },
  {
    step: "STEP 2",
    title: "서류 심사",
    description:
      "제출된 지원서를 바탕으로 기본 소양, 성장 가능성, 지원 동기의 진정성을 중심으로 평가합니다. 합격자에게는 개별 연락으로 면접 일정을 안내드립니다.",
  },
  {
    step: "STEP 3",
    title: "면접",
    description:
      "3:1로 진행됩니다. 면접은 매년 5~6월 중 실시되며, 구체적인 일정은 서류 합격자에게 별도 안내됩니다.",
  },
  {
    step: "STEP 4",
    title: "최종 합격",
    description:
      "서류 및 면접 결과를 종합하여 최종 합격자를 선발합니다. 합격자 발표는 홈페이지 공지 및 개별 연락으로 진행됩니다.",
  },
  {
    step: "STEP 5",
    title: "입학식",
    description: "매년 9월, 수료식과 동시에 신입 기수 입학식이 개최됩니다.",
  },
] as const;

const statusMap = {
  UPCOMING: {
    label: "예정",
    className: "border-blue-300 bg-blue-50 text-blue-700",
  },
  OPEN: {
    label: "접수 중",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  CLOSED: {
    label: "마감",
    className: "border-gray-300 bg-gray-50 text-gray-600",
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
      googleFormUrl: cohorts.googleFormUrl,
    })
    .from(cohorts)
    .where(eq(cohorts.isActive, true))
    .orderBy(asc(cohorts.order), asc(cohorts.createdAt));

  const [settings] = await db.select().from(recruitmentSettings).limit(1);

  const dDayText = (() => {
    if (!settings?.deadlineDate) {
      return null;
    }

    const now = new Date();
    const deadline = new Date(settings.deadlineDate);
    const diffMs = deadline.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      return `D-${diffDays}`;
    }

    if (diffDays === 0) {
      return "D-DAY";
    }

    return `D+${Math.abs(diffDays)}`;
  })();

  const qualifications = settings?.qualificationText
    ? settings.qualificationText.split("\n").map((value) => value.trim()).filter(Boolean)
    : [
        "4년제 대학교 재학생 또는 졸업생",
        "학기 중 매주 토요일 수업 참여 가능한 자",
        "고전 읽기와 토론에 관심이 있는 자",
      ];

  const openCohort = activeCohorts.find((cohort) => cohort.recruitmentStatus === "OPEN");
  const isRecruitmentOpen = Boolean(openCohort);
  const nextRecruitmentText =
    settings?.nextRecruitmentYear && settings?.nextRecruitmentMonth
      ? `다음 모집은 ${settings.nextRecruitmentYear}년 ${settings.nextRecruitmentMonth}월에 시작됩니다`
      : "다음 모집 일정은 추후 공지됩니다";

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-16">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          HRA RECRUITMENT
        </Badge>

        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-6xl">
              모집안내
            </h1>
            {openCohort?.googleFormUrl ? (
              <a
                href={openCohort.googleFormUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex shrink-0 items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-700"
              >
                지원하기
              </a>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full bg-blue-100 px-4 py-2 text-sm font-semibold text-blue-400">
                지원하기
              </span>
            )}
          </div>
          {dDayText ? (
            <Badge className="shrink-0 border-red-300 bg-red-50 text-red-700">{dDayText}</Badge>
          ) : (
            <div className="shrink-0" />
          )}
        </div>

        <p className="mt-4 max-w-3xl text-sm text-[#666666] md:text-base">
          HRA는 성장에 진심인 사람을 기다립니다.
        </p>

        <div className="mt-8 rounded-2xl border border-[#D9D9D9] bg-white p-6">
          <h2 className="mb-4 text-lg font-semibold text-[#1a1a1a]">지원 자격</h2>
          <ul className="list-inside list-disc space-y-2 text-sm text-[#666666]">
            {qualifications.map((qualification) => (
              <li key={qualification}>{qualification}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mb-10 flex flex-col items-stretch gap-4 sm:mb-16 xl:flex-row">
        {processSteps.map((item, index) => (
          <div key={item.step} className="flex w-full flex-col items-center gap-4 xl:flex-1 xl:flex-row">
            <Card className="h-full w-full rounded-2xl border border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
              <CardHeader className="space-y-2 pb-3 pt-5">
                <Badge variant="outline" className="w-fit border-gray-300 bg-gray-50 text-gray-600">
                  {item.step}
                </Badge>
                <CardTitle className="text-lg font-semibold text-[#1a1a1a]">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="pb-5 text-sm leading-6 text-[#666666]">
                {item.description}
              </CardContent>
            </Card>

            {index < processSteps.length - 1 ? (
              <div className="flex shrink-0 items-center justify-center py-2 text-2xl font-bold text-blue-600 xl:px-2 xl:py-0">
                <span className="block xl:hidden">↓</span>
                <span className="hidden xl:block">→</span>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="space-y-4">
        {activeCohorts.length === 0 ? (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
            <CardContent className="text-center text-[#666666]">
              현재 등록된 모집 기수가 없습니다.
            </CardContent>
          </Card>
        ) : (
          activeCohorts.map((cohort) => {
            const status = statusMap[cohort.recruitmentStatus];
            const startDate = formatDate(cohort.recruitmentStartDate);
            const endDate = formatDate(cohort.recruitmentEndDate);

            return (
              <Card
                key={cohort.id}
                className="rounded-2xl border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]"
              >
                <CardContent className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-[#1a1a1a] md:text-2xl">{cohort.name}</h2>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    {cohort.description ? (
                      <p className="text-sm text-[#666666] md:text-base">{cohort.description}</p>
                    ) : null}
                    <div className="inline-flex items-center gap-2 text-xs text-[#666666] md:text-sm">
                      <CalendarDays className="size-3.5" />
                      {startDate && endDate ? `${startDate} - ${endDate}` : "모집 일정 추후 공지"}
                    </div>
                  </div>

                  <div className="mt-4 shrink-0 md:mt-0">
                    {cohort.recruitmentStatus === "OPEN" ? (
                      <Badge className="border-blue-200 bg-blue-100 text-blue-700">모집중</Badge>
                    ) : null}
                    {cohort.recruitmentStatus === "CLOSED" ? (
                      <Badge variant="outline" className="text-[#666666]">
                        마감
                      </Badge>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="mt-16 sm:mt-24">
        {!isRecruitmentOpen && !settings?.posterImageUrl ? (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#D9D9D9] bg-white p-12 text-center shadow-[var(--shadow-soft)]">
            <p className="text-xl font-semibold text-[#1a1a1a]">{nextRecruitmentText}</p>
          </div>
        ) : !isRecruitmentOpen && settings?.posterImageUrl ? (
          <div className="space-y-8">
            <Image
              src={settings.posterImageUrl}
              alt="모집 포스터"
              width={1200}
              height={800}
              className="w-full rounded-2xl"
            />
            <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#D9D9D9] bg-white p-8 text-center shadow-[var(--shadow-soft)]">
              <p className="text-lg font-semibold text-[#1a1a1a]">{nextRecruitmentText}</p>
            </div>
          </div>
        ) : settings?.posterImageUrl ? (
          <Image
            src={settings.posterImageUrl}
            alt="모집 포스터"
            width={1200}
            height={800}
            className="w-full rounded-2xl"
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-[#D9D9D9] bg-gray-50 p-12 text-center">
            <ImageIcon className="size-12 text-[#666666]" />
            <p className="font-medium text-[#666666]">모집 포스터가 등록되면 여기에 표시됩니다.</p>
          </div>
        )}
      </section>
    </div>
  );
}
