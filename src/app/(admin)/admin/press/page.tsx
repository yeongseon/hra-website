import Link from "next/link";
import { desc } from "drizzle-orm";
import { Plus } from "lucide-react";
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
import { deletePressArticle } from "@/features/press/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { pressArticles } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function truncateText(value: string | null, maxLength = 50) {
  if (!value) {
    return "-";
  }

  return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
}

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function AdminPressPage() {
  await requireAdmin();

  // 항상 최신 게시일이 위로 오도록 단일 정렬 (공개 페이지 /press 와 동일 규칙).
  const articles = await db
    .select()
    .from(pressArticles)
    .orderBy(desc(pressArticles.publishedAt));

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">언론보도 관리</h1>
        <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]" render={<Link href="/admin/press/new" />}>
          <Plus className="mr-1 size-4" />
          새 언론보도 추가
        </Button>
      </div>

      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-4">
          <CardTitle className="text-base text-[#1a1a1a]">전체 언론보도 {articles.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>언론사</TableHead>
                  <TableHead>게시일</TableHead>
                  <TableHead>순서</TableHead>
                  <TableHead>액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-8 text-center text-[#666666]">
                      등록된 언론보도가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  articles.map((article) => (
                    <TableRow key={article.id}>
                      <TableCell className="max-w-sm font-medium text-[#1a1a1a]">{truncateText(article.title, 70)}</TableCell>
                      <TableCell className="text-[#1a1a1a]">{truncateText(article.source, 30)}</TableCell>
                      <TableCell className="text-[#666666]">{formatDate(article.publishedAt)}</TableCell>
                      <TableCell className="text-[#666666]">{article.order}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" render={<Link href={`/admin/press/${article.id}`} />}>
                            편집
                          </Button>
                          <form action={deletePressArticle.bind(null, article.id)}>
                            <Button type="submit" variant="destructive" size="sm">
                              삭제
                            </Button>
                          </form>
                        </div>
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
