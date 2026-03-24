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
import { ClassLogRowActions } from "@/app/(admin)/admin/class-logs/_components/class-log-row-actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { classLogs, cohorts, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function AdminClassLogsPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      classDate: classLogs.classDate,
      createdAt: classLogs.createdAt,
      authorName: users.name,
      cohortName: cohorts.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .leftJoin(cohorts, eq(classLogs.cohortId, cohorts.id))
    .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">수업일지 관리</h1>
        <Button render={<Link href="/admin/class-logs/new" />}>새 수업일지 작성</Button>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 수업일지 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <Table>
            <TableHeader>
               <TableRow>
                 <TableHead>제목</TableHead>
                 <TableHead>수업일</TableHead>
                 <TableHead>기수</TableHead>
                 <TableHead>작성자</TableHead>
                 <TableHead>작성일</TableHead>
                 <TableHead>관리</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    등록된 수업일지가 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="max-w-[280px] truncate font-medium text-slate-900">
                      {log.title}
                    </TableCell>
                    <TableCell className="text-slate-700">{formatDate(log.classDate)}</TableCell>
                    <TableCell className="text-slate-700">{log.cohortName ?? "-"}</TableCell>
                    <TableCell className="text-slate-700">{log.authorName}</TableCell>
                    <TableCell className="text-slate-700">{formatDate(log.createdAt)}</TableCell>
                    <TableCell>
                      <ClassLogRowActions id={log.id} />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
