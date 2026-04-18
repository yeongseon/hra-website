import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ResourcesTabNav } from "@/app/(admin)/admin/resources/_components/resources-tab-nav";
import { WeeklyTextRowActions } from "@/app/(admin)/admin/resources/weekly-texts/_components/weekly-text-row-actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts, weeklyTexts } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function AdminWeeklyTextsPage() {
  await requireAdmin();

  let hasDbError = false;

  const rows = await db
    .select({
      id: weeklyTexts.id,
      title: weeklyTexts.title,
      fileUrl: weeklyTexts.fileUrl,
      fileName: weeklyTexts.fileName,
      createdAt: weeklyTexts.createdAt,
      cohortName: cohorts.name,
    })
    .from(weeklyTexts)
    .leftJoin(cohorts, eq(weeklyTexts.cohortId, cohorts.id))
    .orderBy(desc(weeklyTexts.createdAt))
    .catch((error) => {
      hasDbError = true;
      console.error("[admin/resources/weekly-texts] DB 조회 오류:", error);
      return [];
    });

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">자료실 관리</h1>
        <Button render={<Link href="/admin/resources/weekly-texts/new" />}>새 주차별 텍스트 추가</Button>
      </div>

      <ResourcesTabNav />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 주차별 텍스트 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          {hasDbError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.
            </div>
          ) : null}

          <div className="-mx-4 overflow-x-auto sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>기수</TableHead>
                  <TableHead>파일명</TableHead>
                  <TableHead>다운로드</TableHead>
                  <TableHead>작성일</TableHead>
                  <TableHead>관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                      등록된 주차별 텍스트가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[260px] truncate font-medium text-slate-900">
                        {row.title}
                      </TableCell>
                      <TableCell className="text-slate-700">{row.cohortName ?? "-"}</TableCell>
                      <TableCell className="max-w-[240px] truncate text-slate-700">{row.fileName}</TableCell>
                      <TableCell>
                        <a
                          href={row.fileUrl}
                          download={row.fileName}
                          className="text-sm font-medium text-[#2563EB] hover:underline"
                        >
                          파일 받기
                        </a>
                      </TableCell>
                      <TableCell className="text-slate-700">{formatDate(row.createdAt)}</TableCell>
                      <TableCell>
                        <WeeklyTextRowActions id={row.id} />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
