import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Pin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
import { NoticeRowActions } from "@/app/(admin)/admin/notices/_components/notice-row-actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { notices, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function AdminNoticesPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: notices.id,
      title: notices.title,
      status: notices.status,
      pinned: notices.pinned,
      createdAt: notices.createdAt,
      authorName: users.name,
    })
    .from(notices)
    .innerJoin(users, eq(notices.authorId, users.id))
    .orderBy(desc(notices.pinned), desc(notices.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">공지사항 관리</h1>
        <Button render={<Link href="/admin/notices/new" />}>새 공지 작성</Button>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 공지 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <Table>
            <TableHeader>
               <TableRow>
                 <TableHead>제목</TableHead>
                 <TableHead>상태</TableHead>
                 <TableHead>고정</TableHead>
                 <TableHead>작성자</TableHead>
                 <TableHead>날짜</TableHead>
                 <TableHead>관리</TableHead>
               </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    등록된 공지사항이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((notice) => (
                  <TableRow key={notice.id}>
                    <TableCell className="max-w-[280px] truncate font-medium text-slate-900">
                      {notice.title}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={notice.status === "PUBLISHED" ? "default" : "secondary"}
                        className={
                          notice.status === "PUBLISHED"
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-slate-100 text-slate-700"
                        }
                      >
                        {notice.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {notice.pinned ? (
                        <span className="inline-flex items-center text-amber-600">
                          <Pin className="size-4" />
                        </span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-700">{notice.authorName}</TableCell>
                    <TableCell className="text-slate-700">{formatDate(notice.createdAt)}</TableCell>
                    <TableCell>
                      <NoticeRowActions
                        id={notice.id}
                        pinned={notice.pinned}
                        status={notice.status}
                      />
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
