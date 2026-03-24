/**
 * 공지사항 관리 페이지 (AdminNoticesPage)
 * 
 * 관리자가 작성한 모든 공지사항을 목록으로 보는 페이지입니다.
 * - DB에서 공지사항 데이터 조회 (제목, 상태, 고정 여부, 작성자, 날짜)
 * - 테이블 형식으로 표시
 * - 각 공지사항 옆에 "수정", "고정", "게시", "삭제" 액션 버튼
 * - "새 공지 작성" 버튼으로 새 공지사항 페이지 이동
 */

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

// 캐시 비활성화 — 매번 새로운 데이터를 조회
export const dynamic = "force-dynamic";

/**
 * 날짜를 한국어 형식으로 포맷하는 함수
 * 예: 2024-12-25 -> "2024-12-25"
 */
const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function AdminNoticesPage() {
  // 관리자 권한 확인 — 비관리자는 자동으로 로그인 페이지로 이동
  await requireAdmin();

  // DB 조회: 공지사항 테이블에서 필요한 데이터 가져오기
  // - SELECT: 조회할 컬럼 지정
  // - FROM notices: notices 테이블에서
  // - innerJoin users: 공지의 작성자 정보를 users 테이블에서 가져오기
  // - orderBy: 고정된 공지를 먼저, 그 다음 최신순으로 정렬
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
      {/* 페이지 제목 + 새 공지 버튼 */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">공지사항 관리</h1>
        <Button render={<Link href="/admin/notices/new" />}>새 공지 작성</Button>
      </div>

      {/* 공지사항 목록 테이블 */}
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
                // 공지사항이 없을 때 표시
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                    등록된 공지사항이 없습니다.
                  </TableCell>
                </TableRow>
              ) : (
                // 공지사항 목록 표시
                rows.map((notice) => (
                  <TableRow key={notice.id}>
                    <TableCell className="max-w-[280px] truncate font-medium text-slate-900">
                      {notice.title}
                    </TableCell>
                    {/* 상태 배지: 게시됨(초록) vs 임시저장(회색) */}
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
                    {/* 고정 여부: 고정되면 핀 아이콘, 아니면 하이픈 */}
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
                    {/* 행 액션 버튼 (수정, 고정, 게시, 삭제) */}
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
