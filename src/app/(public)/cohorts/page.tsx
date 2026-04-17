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
};

// DB가 비었을 때 사용하는 fallback 데이터
const fallbackCohorts = [
  { name: "19기", startDate: new Date("2025-09-01"), endDate: new Date("2026-08-31"), description: "새로운 도전을 향해 나아가는 19기", isActive: true, imageUrl: null },
  { name: "18기", startDate: new Date("2024-09-01"), endDate: new Date("2025-08-31"), description: "함께 성장하며 미래를 그리다.", isActive: false, imageUrl: null },
  { name: "17기", startDate: new Date("2023-09-01"), endDate: new Date("2024-08-31"), description: "한계를 극복하고 성장으로 보답하다.", isActive: false, imageUrl: null },
  { name: "16기", startDate: new Date("2022-09-01"), endDate: new Date("2023-08-31"), description: "변화를 주도하는 혁신가들.", isActive: false, imageUrl: null },
  { name: "15기", startDate: new Date("2021-09-01"), endDate: new Date("2022-08-31"), description: "열정과 끈기로 내일을 열다.", isActive: false, imageUrl: null },
  { name: "14기", startDate: new Date("2020-09-01"), endDate: new Date("2021-08-31"), description: "어려움 속에서도 빛나는 연대.", isActive: false, imageUrl: null },
  { name: "13기", startDate: new Date("2019-09-01"), endDate: new Date("2020-08-31"), description: "다양성이 만드는 시너지.", isActive: false, imageUrl: null },
  { name: "12기", startDate: new Date("2018-09-01"), endDate: new Date("2019-08-31"), description: "질문하고 탐구하며 나아가다.", isActive: false, imageUrl: null },
  { name: "11기", startDate: new Date("2017-09-01"), endDate: new Date("2018-08-31"), description: "세상을 바꾸는 작은 발걸음.", isActive: false, imageUrl: null },
  { name: "10기", startDate: new Date("2016-09-01"), endDate: new Date("2017-08-31"), description: "10년의 발자취, 새로운 도약.", isActive: false, imageUrl: null },
  { name: "9기", startDate: new Date("2015-09-01"), endDate: new Date("2016-08-31"), description: "틀을 깨고 세상을 연결하다.", isActive: false, imageUrl: null },
  { name: "8기", startDate: new Date("2014-09-01"), endDate: new Date("2015-08-31"), description: "지식과 경험의 공유.", isActive: false, imageUrl: null },
  { name: "7기", startDate: new Date("2013-09-01"), endDate: new Date("2014-08-31"), description: "협력을 통한 상생의 길.", isActive: false, imageUrl: null },
  { name: "6기", startDate: new Date("2012-09-01"), endDate: new Date("2013-08-31"), description: "미래를 디자인하는 사람들.", isActive: false, imageUrl: null },
  { name: "5기", startDate: new Date("2011-09-01"), endDate: new Date("2012-08-31"), description: "창의적 사고로 세상을 보다.", isActive: false, imageUrl: null },
  { name: "4기", startDate: new Date("2010-09-01"), endDate: new Date("2011-08-31"), description: "도전하는 용기, 성취하는 기쁨.", isActive: false, imageUrl: null },
  { name: "3기", startDate: new Date("2009-09-01"), endDate: new Date("2010-08-31"), description: "더 나은 사회를 위한 발판.", isActive: false, imageUrl: null },
  { name: "2기", startDate: new Date("2008-09-01"), endDate: new Date("2009-08-31"), description: "지성의 연대, 행동하는 지성.", isActive: false, imageUrl: null },
  { name: "1기", startDate: new Date("2007-09-01"), endDate: new Date("2008-08-31"), description: "HRA의 첫걸음, 역사의 시작.", isActive: false, imageUrl: null },
];

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

    cohortData = dbCohorts.length > 0 ? dbCohorts : fallbackCohorts;
  } catch {
    cohortData = fallbackCohorts;
  }

  const totalCohorts = cohortData.length;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          HRA COHORTS
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
          기수 소개
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          HRA의 역대 기수를 소개합니다. 현재까지 총 {totalCohorts}기가 함께했습니다.
        </p>
      </section>

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
    </div>
  );
}
