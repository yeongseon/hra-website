import Image from "next/image";
import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { cohorts as cohortsTable } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "기수 소개",
  description: "1기부터 현재까지 HRA의 모든 기수와 함께한 청년들의 발자취를 한눈에 확인하세요.",
};

function formatPeriod(startDate: Date | null, endDate: Date | null) {
  if (!startDate || !endDate) return "";
  const fmt = (d: Date) => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `${fmt(startDate)} - ${fmt(endDate)}`;
}

export default async function CohortsPage() {
  let cohortData: Array<{
    name: string;
    startDate: Date | null;
    endDate: Date | null;
    description: string | null;
    isActive: boolean;
    imageUrl: string | null;
  }>;

  try {
    const dbCohorts = await db
      .select({
        name: cohortsTable.name,
        startDate: cohortsTable.startDate,
        endDate: cohortsTable.endDate,
        description: cohortsTable.description,
        isActive: cohortsTable.isActive,
        imageUrl: cohortsTable.imageUrl,
        order: cohortsTable.order,
      })
      .from(cohortsTable)
      .orderBy(desc(cohortsTable.order));

    cohortData = dbCohorts;
  } catch (error) {
    // DB 조회 실패 시: 빈 화면이 "데이터 없음"과 구분되도록 서버 로그에 명확히 기록한다.
    // 이렇게 해야 운영 중 실제 장애와 단순한 미시드(미입력) 상태를 구분할 수 있다.
    console.error("[cohorts/page] DB 조회 실패 - 빈 목록으로 폴백합니다:", error);
    cohortData = [];
  }

  const totalCohorts = cohortData.length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          기수 안내
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
          기수 소개
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          HRA의 역대 기수를 소개합니다. 현재까지 총 {totalCohorts}기가 함께했습니다.
        </p>
      </section>

      {cohortData.length > 0 ? (
        <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-16 sm:pb-24 md:pb-32">
          {cohortData.map((cohort) => (
            <div
              key={cohort.name}
              className={`group relative flex flex-col justify-between rounded-2xl bg-white shadow-[var(--shadow-soft)] overflow-hidden transition-all hover:bg-gray-50 hover:border-blue-400 hover:-translate-y-1 ${
                cohort.isActive ? "border-blue-500 border-2" : "border border-[#D9D9D9]"
              }`}
            >
              <div className="h-40 sm:h-48 bg-gradient-to-br from-gray-50 to-blue-50 flex items-center justify-center relative">
                {cohort.imageUrl ? (
                  <Image
                    src={cohort.imageUrl}
                    alt={`${cohort.name} 사진`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
                  />
                ) : (
                  <Users className="w-12 h-12 text-[#666666]" />
                )}
              </div>

              <div className="p-5 sm:p-6 flex-1 flex flex-col">
                <div className="flex items-start justify-between mb-4">
                  <h2 className="text-2xl font-bold tracking-tight text-[#1a1a1a]">
                    {cohort.name}
                  </h2>
                  {cohort.isActive ? (
                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 rounded-full px-3 py-1">
                      진행 중
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-300 rounded-full px-3 py-1">
                      수료
                    </Badge>
                  )}
                </div>

                <div className="space-y-3 mb-6 flex-1">
                  {(cohort.startDate || cohort.endDate) ? (
                    <div className="flex items-center text-sm text-[#666666]">
                      <Calendar className="w-4 h-4 mr-2 text-[#666666]" />
                      <span>{formatPeriod(cohort.startDate, cohort.endDate)}</span>
                    </div>
                  ) : null}
                </div>

                {cohort.description ? (
                  <div className="pt-4 border-t border-[#D9D9D9] mt-auto">
                    <p className="text-[#666666] text-sm font-medium line-clamp-2">
                      &quot;{cohort.description}&quot;
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#D9D9D9] bg-white px-6 py-12 text-center text-[#666666] shadow-[var(--shadow-soft)]">
          등록된 기수가 없습니다. 곧 업데이트될 예정입니다.
        </div>
      )}
    </div>
  );
}
