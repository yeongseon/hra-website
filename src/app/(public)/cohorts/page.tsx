import { Badge } from "@/components/ui/badge";
import { Users, Calendar } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "기수 소개",
};

type CohortStatus = "completed" | "active";

interface Cohort {
  cohortNumber: number;
  period: string;
  graduates: number | "진행중";
  motto: string;
  status: CohortStatus;
}

const cohorts: Cohort[] = [
  { cohortNumber: 19, period: "2025.09 - 2026.08", graduates: "진행중", motto: "새로운 도전을 향해 나아가는 19기", status: "active" },
  { cohortNumber: 18, period: "2024.09 - 2025.08", graduates: 23, motto: "함께 성장하며 미래를 그리다.", status: "completed" },
  { cohortNumber: 17, period: "2023.09 - 2024.08", graduates: 22, motto: "한계를 극복하고 성장으로 보답하다.", status: "completed" },
  { cohortNumber: 16, period: "2022.09 - 2023.08", graduates: 24, motto: "변화를 주도하는 혁신가들.", status: "completed" },
  { cohortNumber: 15, period: "2021.09 - 2022.08", graduates: 21, motto: "열정과 끈기로 내일을 열다.", status: "completed" },
  { cohortNumber: 14, period: "2020.09 - 2021.08", graduates: 22, motto: "어려움 속에서도 빛나는 연대.", status: "completed" },
  { cohortNumber: 13, period: "2019.09 - 2020.08", graduates: 23, motto: "다양성이 만드는 시너지.", status: "completed" },
  { cohortNumber: 12, period: "2018.09 - 2019.08", graduates: 20, motto: "질문하고 탐구하며 나아가다.", status: "completed" },
  { cohortNumber: 11, period: "2017.09 - 2018.08", graduates: 25, motto: "세상을 바꾸는 작은 발걸음.", status: "completed" },
  { cohortNumber: 10, period: "2016.09 - 2017.08", graduates: 22, motto: "10년의 발자취, 새로운 도약.", status: "completed" },
  { cohortNumber: 9, period: "2015.09 - 2016.08", graduates: 21, motto: "틀을 깨고 세상을 연결하다.", status: "completed" },
  { cohortNumber: 8, period: "2014.09 - 2015.08", graduates: 23, motto: "지식과 경험의 공유.", status: "completed" },
  { cohortNumber: 7, period: "2013.09 - 2014.08", graduates: 22, motto: "협력을 통한 상생의 길.", status: "completed" },
  { cohortNumber: 6, period: "2012.09 - 2013.08", graduates: 24, motto: "미래를 디자인하는 사람들.", status: "completed" },
  { cohortNumber: 5, period: "2011.09 - 2012.08", graduates: 20, motto: "창의적 사고로 세상을 보다.", status: "completed" },
  { cohortNumber: 4, period: "2010.09 - 2011.08", graduates: 23, motto: "도전하는 용기, 성취하는 기쁨.", status: "completed" },
  { cohortNumber: 3, period: "2009.09 - 2010.08", graduates: 21, motto: "더 나은 사회를 위한 발판.", status: "completed" },
  { cohortNumber: 2, period: "2008.09 - 2009.08", graduates: 22, motto: "지성의 연대, 행동하는 지성.", status: "completed" },
  { cohortNumber: 1, period: "2007.09 - 2008.08", graduates: 21, motto: "HRA의 첫걸음, 역사의 시작.", status: "completed" },
];

export default function CohortsPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6">
      <section className="py-12 sm:py-20 md:py-32">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
          <div>
            <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold tracking-tight text-white">
              기수 소개
            </h1>
            <p className="mt-4 sm:mt-6 text-base sm:text-lg md:text-xl text-gray-400 max-w-3xl leading-relaxed">
              현재 HRA는 19기를 맞이했으며, 1기부터 18기까지 총 399명의 수료생을 배출했습니다. 아래에서 각 기수의 프로필을 확인하실 수 있습니다.
            </p>
          </div>
          <div className="flex gap-4 sm:text-right text-gray-400">
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="text-sm">총 기수</div>
              <div className="text-2xl font-bold text-white">19기</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-4 border border-white/10">
              <div className="text-sm">총 수료생</div>
              <div className="text-2xl font-bold text-white">399명</div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 pb-16 sm:pb-24 md:pb-32">
        {cohorts.map((cohort) => (
          <div
            key={cohort.cohortNumber}
            className="group relative flex flex-col justify-between rounded-3xl bg-white/5 border border-white/10 overflow-hidden transition-all hover:bg-white/10 hover:-translate-y-1"
          >
            <div className="h-40 sm:h-48 bg-gradient-to-br from-white/5 to-white/10 flex items-center justify-center">
              <Users className="w-12 h-12 text-white/20" />
            </div>

            <div className="p-5 sm:p-6 flex-1 flex flex-col">
              <div className="flex items-start justify-between mb-4">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  {cohort.cohortNumber}기
                </h2>
                {cohort.status === "active" ? (
                  <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 rounded-full px-3 py-1">
                    진행중
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-white/5 text-gray-400 border-white/10 rounded-full px-3 py-1">
                    수료
                  </Badge>
                )}
              </div>
              
              <div className="space-y-3 mb-6 flex-1">
                <div className="flex items-center text-sm text-gray-400">
                  <Calendar className="w-4 h-4 mr-2 text-gray-500" />
                  <span>{cohort.period}</span>
                </div>
                <div className="flex items-center text-sm text-gray-400">
                  <Users className="w-4 h-4 mr-2 text-gray-500" />
                  <span>
                    {typeof cohort.graduates === "number"
                      ? `${cohort.graduates}명 수료`
                      : cohort.graduates}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 mt-auto">
                <p className="text-gray-300 text-sm font-medium line-clamp-2">
                  &quot;{cohort.motto}&quot;
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
