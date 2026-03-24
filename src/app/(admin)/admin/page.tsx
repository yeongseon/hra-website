/**
 * 관리자 대시보드 페이지 (AdminDashboardPage)
 * 
 * 관리자 페이지 메인 화면입니다.
 * - 데이터베이스에서 각 데이터 개수(공지, 수업일지, 기수, 지원서, 멤버)를 조회
 * - 카드 형태로 통계 정보 표시
 * - 관리자가 HRA 운영 현황을 한눈에 파악할 수 있음
 */

import { count } from "drizzle-orm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { applications, classLogs, cohorts, notices, users } from "@/lib/db/schema";

// 캐시 비활성화 — 매번 새로운 데이터를 조회하도록 강제
export const dynamic = "force-dynamic";

// 대시보드에 표시할 통계 항목들 정의
// 데이터베이스 테이블과 화면에 표시할 라벨 매핑
const stats = [
  { key: "notices", label: "전체 공지사항", value: 0 },
  { key: "classLogs", label: "전체 수업일지", value: 0 },
  { key: "cohorts", label: "전체 기수", value: 0 },
  { key: "applications", label: "전체 지원서", value: 0 },
  { key: "members", label: "전체 멤버", value: 0 },
] as const;

export default async function AdminDashboardPage() {
  // Promise.all() — 5개의 DB 조회를 동시에 실행 (순서 상관없음)
  // count() — 각 테이블의 행 개수를 가져오는 Drizzle ORM 함수
  const [noticeRows, classLogRows, cohortRows, applicationRows, memberRows] =
    await Promise.all([
      db.select({ total: count() }).from(notices),
      db.select({ total: count() }).from(classLogs),
      db.select({ total: count() }).from(cohorts),
      db.select({ total: count() }).from(applications),
      db.select({ total: count() }).from(users),
    ]);

  // DB 조회 결과를 객체로 변환 (사용하기 편한 형태로 정리)
  // Number() — 문자열 타입의 개수를 숫자로 변환
  // ?? 0 — 값이 없으면 0으로 설정 (기본값)
  const values = {
    notices: Number(noticeRows[0]?.total ?? 0),
    classLogs: Number(classLogRows[0]?.total ?? 0),
    cohorts: Number(cohortRows[0]?.total ?? 0),
    applications: Number(applicationRows[0]?.total ?? 0),
    members: Number(memberRows[0]?.total ?? 0),
  } as const;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 md:text-3xl">대시보드</h1>
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
