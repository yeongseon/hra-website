// FAQ 질문·답변 관리 목록 페이지 (관리자 전용)

import Link from "next/link";
import { asc } from "drizzle-orm";
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
import { deleteFaqItem } from "@/features/faq/actions";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { faqItems } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

function truncate(text: string, max = 60) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export default async function AdminFaqPage() {
  await requireAdmin();

  const items = await db
    .select()
    .from(faqItems)
    .orderBy(asc(faqItems.order), asc(faqItems.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a]">FAQ 관리</h1>
        <Button className="bg-[#1a1a1a] text-white hover:bg-[#333333]" render={<Link href="/admin/faq/new" />}>
          <Plus className="mr-1 size-4" />
          새 질문 추가
        </Button>
      </div>

      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-4">
          <CardTitle className="text-base text-[#1a1a1a]">전체 FAQ {items.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16 text-center">순서</TableHead>
                  <TableHead>질문</TableHead>
                  <TableHead>답변 (미리보기)</TableHead>
                  <TableHead className="w-32">액션</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-[#666666]">
                      등록된 FAQ가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-center text-[#666666]">{item.order}</TableCell>
                      <TableCell className="max-w-xs font-medium text-[#1a1a1a]">
                        {truncate(item.question, 60)}
                      </TableCell>
                      <TableCell className="max-w-sm text-sm text-[#666666]">
                        {truncate(item.answer, 80)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            render={<Link href={`/admin/faq/${item.id}`} />}
                          >
                            편집
                          </Button>
                          <form action={deleteFaqItem.bind(null, item.id)}>
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
