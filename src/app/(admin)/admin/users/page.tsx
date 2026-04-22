/**
 * 회원 관리 페이지
 * 
 * 관리자가 전체 회원 목록을 확인하고 역할(ADMIN/MEMBER)을 변경할 수 있는 페이지입니다.
 * - 회원 목록을 테이블로 표시
 * - 각 회원의 역할을 변경하는 버튼 제공
 */

import { desc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { UserRoleButton } from "./_components/user-role-button";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function AdminUsersPage() {
  const session = await requireAdmin();

  // DB 조회 결과와 오류 여부를 함께 반환해 렌더 이후 재할당을 피합니다.
  const { rows, hasDbError } = await (async () => {
    try {
      const rows = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          image: users.image,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(desc(users.createdAt));

      return { rows, hasDbError: false };
    } catch (error) {
      console.error("[admin/users] DB 조회 오류:", error);
      return { rows: [], hasDbError: true };
    }
  })();

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">회원 관리</h1>
        <p className="mt-1 text-sm text-slate-500">전체 회원 목록을 확인하고 역할을 변경할 수 있습니다.</p>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 회원 {rows.length}명</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          {hasDbError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              데이터를 불러오지 못했습니다. 데이터베이스 연결을 확인해 주세요.
            </div>
          ) : null}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>역할</TableHead>
                  <TableHead>가입일</TableHead>
                  <TableHead>역할 변경</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-slate-500">
                      등록된 회원이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-slate-900">{row.name}</TableCell>
                      <TableCell className="text-slate-600">{row.email}</TableCell>
                      <TableCell>
                        <Badge
                          variant={row.role === "ADMIN" ? "default" : "secondary"}
                          className={
                            row.role === "ADMIN"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-700"
                          }
                        >
                          {row.role === "ADMIN" ? "관리자" : "멤버"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-600">{formatDate(row.createdAt)}</TableCell>
                      <TableCell>
                        {row.id === session.user?.id ? (
                          <span className="text-xs text-slate-400">본인</span>
                        ) : (
                          <UserRoleButton
                            userId={row.id}
                            currentRole={row.role}
                          />
                        )}
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
