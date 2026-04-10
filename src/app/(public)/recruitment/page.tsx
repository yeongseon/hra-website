/**
 * 모집 안내 페이지 - /recruitment
 *
 * 이 페이지는 HRA 프로그램의 모집 정보를 사용자들에게 보여줍니다.
 * 페이지 흐름:
 * 1. 데이터베이스에서 활성화된 기수(cohorts) 목록을 가져옵니다
 * 2. 모집 절차 4단계를 카드로 표시합니다
 * 3. 각 기수의 모집 상태에 따라 "지원하기" 버튼 표시 여부를 결정합니다
 * 4. "지원하기" 버튼 클릭 시 지원서 작성 페이지로 이동합니다
 *
 * 이것은 서버 컴포넌트이므로 async function으로 작성되어,
 * 데이터베이스에 직접 접근할 수 있습니다.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays, ImageIcon } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { cohorts, recruitmentSettings } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "모집안내",
};

/**
 * 모집 절차 단계 정보
 * 사용자에게 보여줄 4단계 지원 절차입니다.
 */
const processSteps = [
  { step: "STEP 1", title: "지원서 작성", subtitle: "Write Application" },
  { step: "STEP 2", title: "서류 심사", subtitle: "Document Review" },
  { step: "STEP 3", title: "면접", subtitle: "Interview" },
  { step: "STEP 4", title: "최종 합격", subtitle: "Final Acceptance" },
] as const;

/**
 * 모집 상태 맵핑
 * 데이터베이스의 모집 상태(UPCOMING, OPEN, CLOSED)를 화면에 표시할
 * 한글 텍스트와 디자인(배경색, 텍스트색)으로 변환합니다.
 */
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

/**
 * 날짜 포매팅 함수
 * 데이터베이스에서 받은 Date 객체를 "YYYY.MM.DD" 형식의 한글 표시로 변환합니다.
 * Intl.DateTimeFormat을 사용해 브라우저의 로케일에 맞는 날짜 형식으로 변환합니다.
 */
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
  /**
   * 데이터베이스 쿼리: 활성화된 기수 목록 가져오기
   * 
   * 1. select({...}): 가져올 컬럼들을 명시합니다
   * 2. from(cohorts): cohorts 테이블에서 데이터를 가져옵니다
   * 3. where(eq(cohorts.isActive, true)): isActive가 true인 기수만 필터합니다
   * 4. orderBy(...): 정렬 순서를 지정합니다 (order, 생성 날짜 순)
   *
   * 서버 컴포넌트에서 직접 데이터베이스에 접근하므로 await를 사용합니다.
   */
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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      {/* 페이지 상단: 제목 영역 */}
      <section className="mb-10 sm:mb-16 space-y-4">
          <Badge
            variant="outline"
            className="border-blue-300 bg-blue-50 text-blue-700"
          >
            HRA RECRUITMENT
          </Badge>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-semibold tracking-tight text-[#1a1a1a]">
            모집안내
          </h1>
          {dDayText && <Badge className="border-red-300 bg-red-50 text-red-700">{dDayText}</Badge>}
        </div>
        <p className="max-w-3xl text-sm text-[#666666] md:text-base mt-4">
          HRA는 성장에 진심인 사람을 기다립니다.
        </p>
        
        <div className="mt-8 border border-[#D9D9D9] rounded-2xl p-6 bg-white">
          <h2 className="text-lg font-semibold text-[#1a1a1a] mb-4">지원 자격</h2>
          <ul className="space-y-2 text-sm text-[#666666] list-disc list-inside">
            {qualifications.map((qualification) => (
              <li key={qualification}>{qualification}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* 모집 절차 표시: processSteps 배열의 각 항목을 카드로 렌더링 */}
      <section className="mb-10 sm:mb-16 flex flex-col xl:flex-row items-stretch gap-4">
        {processSteps.map((item, index) => (
          <div key={item.step} className="flex flex-col xl:flex-row items-center gap-4 w-full xl:w-auto flex-1">
            <Card className="w-full h-full border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0">
              <CardHeader className="space-y-2 pb-3 pt-5">
                <Badge variant="outline" className="w-fit border-gray-300 bg-gray-50 text-gray-600">
                  {item.step}
                </Badge>
                <CardTitle className="text-lg text-[#1a1a1a]">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="pb-5 text-sm text-[#666666]">
                {item.subtitle}
              </CardContent>
            </Card>
            {index < processSteps.length - 1 && (
              <div className="shrink-0 text-blue-600 text-2xl font-bold flex justify-center items-center py-2 xl:py-0 xl:px-2">
                <span className="hidden xl:block">→</span>
                <span className="block xl:hidden">↓</span>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* 기수 목록 표시 */}
      <section className="space-y-4">
        {/* 
          등록된 기수가 없을 때: 안내 메시지 표시
          있을 때: 각 기수 정보를 카드로 표시
        */}
        {activeCohorts.length === 0 ? (
          <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-10">
            <CardContent className="text-center text-[#666666]">
              현재 등록된 모집 기수가 없습니다.
            </CardContent>
          </Card>
        ) : (
          activeCohorts.map((cohort) => {
            // 이 기수의 모집 상태 정보를 statusMap에서 조회합니다
            const status = statusMap[cohort.recruitmentStatus];
            // 날짜를 한글로 포매팅합니다
            const startDate = formatDate(cohort.recruitmentStartDate);
            const endDate = formatDate(cohort.recruitmentEndDate);

            return (
              <Card key={cohort.id} className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0">
                <CardContent className="flex flex-col gap-6 py-6 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold text-[#1a1a1a] md:text-2xl">
                        {cohort.name}
                      </h2>
                      <Badge variant="outline" className={status.className}>
                        {status.label}
                      </Badge>
                    </div>
                    {cohort.description ? (
                      <p className="text-sm text-[#666666] md:text-base">{cohort.description}</p>
                    ) : null}
                    <div className="inline-flex items-center gap-2 text-xs text-[#666666] md:text-sm">
                      <CalendarDays className="size-3.5" />
                      {startDate && endDate
                        ? `${startDate} - ${endDate}`
                        : "모집 일정 추후 공지"}
                    </div>
                  </div>

                  <div className="shrink-0 mt-4 md:mt-0">
                    {cohort.recruitmentStatus === "OPEN" && cohort.googleFormUrl && (
                      <Link href={cohort.googleFormUrl} target="_blank" rel="noopener noreferrer">
                        <Button className="h-10 w-full md:w-auto bg-blue-600 text-white hover:bg-blue-700">
                          지원하기
                          <ArrowRight className="size-4 ml-1.5" />
                        </Button>
                      </Link>
                    )}
                    {cohort.recruitmentStatus === "CLOSED" && (
                      <Button disabled className="h-10 w-full md:w-auto bg-gray-100 text-[#666666] cursor-not-allowed">
                        마감
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </section>

      <section className="mt-16 sm:mt-24">
        {settings?.posterImageUrl ? (
          <img src={settings.posterImageUrl} alt="모집 포스터" className="w-full rounded-2xl" />
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
