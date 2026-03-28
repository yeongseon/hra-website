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
    className: "border-blue-300/50 bg-blue-500/15 text-blue-100",
  },
  OPEN: {
    label: "접수 중",
    className: "border-emerald-300/50 bg-emerald-500/20 text-emerald-100",
  },
  CLOSED: {
    label: "마감",
    className: "border-zinc-300/30 bg-zinc-500/20 text-zinc-200",
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

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      {/* 페이지 상단: 제목 영역 */}
      <section className="mb-10 sm:mb-16 space-y-4">
        <Badge
          variant="outline"
          className="border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
        >
          HRA RECRUITMENT
        </Badge>
        <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-semibold tracking-tight text-white">
          모집안내
        </h1>
        <p className="max-w-3xl text-sm text-zinc-300 md:text-base">
          HRA는 성장에 진심인 사람을 기다립니다.
        </p>
        <ul className="mt-4 space-y-2 text-sm text-zinc-400 list-disc list-inside">
          <li>지원서 제출은 구글폼을 연동하는 방식으로 운영됩니다.</li>
          <li>면접 일정은 현기수가 별도로 관리하며, 홈페이지에는 별도 업로드하지 않습니다.</li>
        </ul>
      </section>

      {/* 모집 절차 표시: processSteps 배열의 각 항목을 카드로 렌더링 */}
      <section className="mb-10 sm:mb-16 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

      {/* 기수 목록 표시 */}
      <section className="space-y-4">
        {/* 
          등록된 기수가 없을 때: 안내 메시지 표시
          있을 때: 각 기수 정보를 카드로 표시
        */}
        {activeCohorts.length === 0 ? (
          <Card className="border-white/10 bg-zinc-950/80 py-10">
            <CardContent className="text-center text-zinc-300">
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

                  {/* 
                    "지원하기" 버튼은 모집 상태가 "OPEN"이고 구글폼 URL이 있을 때만 표시됩니다.
                    버튼 클릭 시 각 기수에 설정된 구글폼 외부 링크로 이동합니다.
                  */}
                  {cohort.recruitmentStatus === "OPEN" && cohort.googleFormUrl ? (
                    <Link href={cohort.googleFormUrl} target="_blank" rel="noopener noreferrer">
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
