/**
 * 관리자 대시보드 페이지 (AdminDashboardPage)
 *
 * 관리자 페이지 메인 화면입니다.
 * - 공지사항/갤러리: 파일시스템(content/)에서 개수 조회
 * - 수업일지/기수/멤버: 데이터베이스에서 개수 조회
 * - 카드 형태로 통계 정보 표시
 */

import { count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogs, cohorts, users } from "@/lib/db/schema";
import { getAllNoticesUnfiltered } from "@/lib/content/notices";
import { getAllGalleries } from "@/lib/content/gallery";

// 캐시 비활성화 — 매번 새로운 데이터를 조회하도록 강제
export const dynamic = "force-dynamic";

// 대시보드에 표시할 통계 항목들 정의
const stats = [
  { key: "notices", label: "전체 공지사항", value: 0 },
  { key: "galleries", label: "전체 갤러리", value: 0 },
  { key: "classLogs", label: "전체 자료(수업일지)", value: 0 },
  { key: "cohorts", label: "전체 기수", value: 0 },
  { key: "members", label: "전체 멤버", value: 0 },
] as const;

export default async function AdminDashboardPage() {
  // 파일시스템(공지사항, 갤러리) + DB(수업일지, 기수, 멤버) 동시 조회
  const [allNotices, allGalleries, classLogRows, cohortRows, memberRows] =
    await Promise.all([
      getAllNoticesUnfiltered(),
      getAllGalleries(),
      db.select({ total: count() }).from(classLogs),
      db.select({ total: count() }).from(cohorts),
      db.select({ total: count() }).from(users),
    ]);

  const values = {
    notices: allNotices.length,
    galleries: allGalleries.length,
    classLogs: Number(classLogRows[0]?.total ?? 0),
    cohorts: Number(cohortRows[0]?.total ?? 0),
    members: Number(memberRows[0]?.total ?? 0),
  } as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-slate-900">대시보드</h1>
        <p className="mt-1 text-sm text-slate-600">HRA 운영 현황을 한눈에 확인하세요.</p>
      </div>

      {/* 통계 카드들을 그리드 레이아웃으로 표시 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {stats.map((stat) => (
          <Card
            key={stat.key}
            className="border border-slate-200 bg-white py-0 shadow-sm ring-0"
          >
            <CardHeader className="pb-2 pt-5">
              <CardTitle className="text-sm font-medium text-slate-500">
                {stat.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-5">
              <p className="text-3xl font-semibold tracking-tight text-slate-900">
                {/* toLocaleString() — 숫자를 한국어 형식으로 포맷 (예: 1,000) */}
                {values[stat.key].toLocaleString("ko-KR")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
