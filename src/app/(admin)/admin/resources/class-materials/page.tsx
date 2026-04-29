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
import { ClassMaterialRowActions } from "@/app/(admin)/admin/resources/class-materials/_components/class-material-row-actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { classMaterials, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const formatAudience = (audience: string) => (audience === "FACULTY" ? "교수용" : "학생용");

export default async function AdminClassMaterialsPage() {
  await requireAdmin();

  const { rows, hasDbError } = await (async () => {
    try {
      const rows = await db
        .select({
          id: classMaterials.id,
          title: classMaterials.title,
          weekNumber: classMaterials.weekNumber,
          lectureTitle: classMaterials.lectureTitle,
          audience: classMaterials.audience,
          createdAt: classMaterials.createdAt,
          uploaderName: users.name,
        })
        .from(classMaterials)
        .leftJoin(users, eq(classMaterials.uploadedById, users.id))
        .orderBy(desc(classMaterials.createdAt));

      return { rows, hasDbError: false };
    } catch (error) {
      console.error("[admin/resources/class-materials] DB 조회 오류:", error);
      return { rows: [], hasDbError: true };
    }
  })();

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-4 flex items-center justify-between gap-4 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl">자료실 관리</h1>
        <Button render={<Link href="/admin/resources/class-materials/new" />}>새 강의 자료 추가</Button>
      </div>

      <ResourcesTabNav />

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 강의 자료 {rows.length}건</CardTitle>
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
                  <TableHead>주차</TableHead>
                  <TableHead>강의명</TableHead>
                  <TableHead>대상</TableHead>
                  <TableHead>업로드자</TableHead>
                  <TableHead>날짜</TableHead>
                  <TableHead>삭제</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                      등록된 강의 자료가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[260px] truncate font-medium text-slate-900">
                        {row.title}
                      </TableCell>
                      <TableCell className="text-slate-700">{row.weekNumber ?? "-"}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-slate-700">
                        {row.lectureTitle ?? "-"}
                      </TableCell>
                      <TableCell className="text-slate-700">{formatAudience(row.audience)}</TableCell>
                      <TableCell className="text-slate-700">{row.uploaderName ?? "-"}</TableCell>
                      <TableCell className="text-slate-700">{formatDate(row.createdAt)}</TableCell>
                      <TableCell>
                        <ClassMaterialRowActions id={row.id} />
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
