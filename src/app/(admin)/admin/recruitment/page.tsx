import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RecruitmentRowActions } from "@/app/(admin)/admin/recruitment/_components/recruitment-row-actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts, applications } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatDate = (value: Date | null) => {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
};

const statusConfig: Record<string, { label: string; className: string }> = {
  UPCOMING: { label: "UPCOMING", className: "bg-amber-100 text-amber-800" },
  OPEN: { label: "OPEN", className: "bg-emerald-100 text-emerald-800" },
  CLOSED: { label: "CLOSED", className: "bg-slate-100 text-slate-600" },
};

export default async function AdminRecruitmentPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: cohorts.id,
      name: cohorts.name,
      recruitmentStatus: cohorts.recruitmentStatus,
      isActive: cohorts.isActive,
      startDate: cohorts.startDate,
      endDate: cohorts.endDate,
      order: cohorts.order,
      applicationCount: count(applications.id),
    })
    .from(cohorts)
    .leftJoin(applications, eq(applications.cohortId, cohorts.id))
    .groupBy(cohorts.id)
    .orderBy(desc(cohorts.order), desc(cohorts.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">기수 관리</h1>
        <Link
          href="/admin/recruitment/new"
          className={buttonVariants({ className: "bg-slate-900 hover:bg-slate-700" })}
        >
          <Plus className="mr-1 size-4" />새 기수 추가
        </Link>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 기수 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <Table>
            <TableHeader>
               <TableRow>
                 <TableHead>기수명</TableHead>
                 <TableHead>모집 상태</TableHead>
                 <TableHead>활성</TableHead>
                 <TableHead>기간</TableHead>
                 <TableHead>지원자 수</TableHead>
                 <TableHead>관리</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    등록된 기수가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((cohort) => {
                  const config = statusConfig[cohort.recruitmentStatus] ?? statusConfig.CLOSED;

                  return (
                    <TableRow key={cohort.id}>
                      <TableCell className="font-medium text-slate-900">{cohort.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={config.className}>
                          {config.label}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {cohort.isActive ? (
                          <span className="text-emerald-600">활성</span>
                        ) : (
                          <span className="text-slate-400">비활성</span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">
                        {formatDate(cohort.startDate)} ~ {formatDate(cohort.endDate)}
                      </TableCell>
                      <TableCell className="text-slate-700">
                        {Number(cohort.applicationCount)}명
                      </TableCell>
                      <TableCell>
                        <RecruitmentRowActions
                          id={cohort.id}
                          currentStatus={cohort.recruitmentStatus}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
