import { count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogs, cohorts, galleries, notices, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const stats = [
  { key: "notices", label: "전체 공지사항", value: 0 },
  { key: "galleries", label: "전체 갤러리", value: 0 },
  { key: "classLogs", label: "전체 자료(수업일지)", value: 0 },
  { key: "cohorts", label: "전체 기수", value: 0 },
  { key: "members", label: "전체 멤버", value: 0 },
] as const;

export default async function AdminDashboardPage() {
  let noticeRows: Array<{ total: number | bigint }> = [{ total: 0 }];
  let galleryRows: Array<{ total: number | bigint }> = [{ total: 0 }];
  let classLogRows: Array<{ total: number | bigint }> = [{ total: 0 }];
  let cohortRows: Array<{ total: number | bigint }> = [{ total: 0 }];
  let memberRows: Array<{ total: number | bigint }> = [{ total: 0 }];

  try {
    [noticeRows, galleryRows, classLogRows, cohortRows, memberRows] = await Promise.all([
      db.select({ total: count() }).from(notices),
      db.select({ total: count() }).from(galleries),
      db.select({ total: count() }).from(classLogs),
      db.select({ total: count() }).from(cohorts),
      db.select({ total: count() }).from(users),
    ]);
  } catch (error) {
    console.error("[admin/dashboard] DB 조회 오류:", error);

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-semibold text-slate-900">대시보드</h1>
          <p className="mt-1 text-sm text-slate-600">HRA 운영 현황을 한눈에 확인하세요.</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-800">데이터를 불러오지 못했습니다.</p>
          <p className="mt-1 text-xs text-red-600">데이터베이스 연결을 확인해 주세요.</p>
        </div>
      </div>
    );
  }

  const values = {
    notices: Number(noticeRows[0]?.total ?? 0),
    galleries: Number(galleryRows[0]?.total ?? 0),
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
                {values[stat.key].toLocaleString("ko-KR")}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
