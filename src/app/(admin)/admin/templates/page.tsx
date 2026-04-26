/**
 * 보고서 양식 관리 — 목록 페이지
 *
 * 역할: 관리자가 등록된 양식·가이드 목록을 확인하고 신규 작성/편집/삭제로 이동하는 진입점.
 */

import Link from "next/link";
import { asc, desc } from "drizzle-orm";
import { TemplateRowActions } from "@/app/(admin)/admin/templates/_components/template-row-actions";
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
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { reportTemplates } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const categoryLabel = (category: "template" | "guide") =>
  category === "template" ? "양식" : "가이드";

const reportCategoryLabel = (code: string | null) => {
  switch (code) {
    case "management-book":
      return "경영서";
    case "classic-book":
      return "고전명작";
    case "business-practice":
      return "기업실무·한국경제사";
    default:
      return "—";
  }
};

export default async function AdminTemplatesPage() {
  await requireAdmin();

  const rows = await db
    .select({
      id: reportTemplates.id,
      slug: reportTemplates.slug,
      title: reportTemplates.title,
      category: reportTemplates.category,
      reportCategory: reportTemplates.reportCategory,
      version: reportTemplates.version,
      published: reportTemplates.published,
      order: reportTemplates.order,
      updatedAt: reportTemplates.updatedAt,
    })
    .from(reportTemplates)
    .orderBy(asc(reportTemplates.order), desc(reportTemplates.updatedAt));

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[#1a1a1a]">
          보고서 양식 관리
        </h1>
        <Button
          render={<Link href="/admin/templates/new" />}
          className="bg-[#1a1a1a] text-white hover:bg-[#333333]"
        >
          새 양식/가이드
        </Button>
      </div>

      <Card className="border-[#D9D9D9] bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-[#D9D9D9] py-4">
          <CardTitle className="text-base text-[#1a1a1a]">
            전체 {rows.length}건
          </CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>제목</TableHead>
                  <TableHead>구분</TableHead>
                  <TableHead>분야</TableHead>
                  <TableHead>버전</TableHead>
                  <TableHead>슬러그</TableHead>
                  <TableHead>공개</TableHead>
                  <TableHead>수정일</TableHead>
                  <TableHead>관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-[#666666]">
                      등록된 양식이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="max-w-[280px] truncate font-medium text-[#1a1a1a]">
                        {row.title}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={
                            row.category === "template"
                              ? "bg-blue-100 text-blue-800"
                              : "bg-slate-100 text-slate-700"
                          }
                        >
                          {categoryLabel(row.category)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-[#1a1a1a]">
                        {reportCategoryLabel(row.reportCategory)}
                      </TableCell>
                      <TableCell className="text-[#666666]">{row.version}</TableCell>
                      <TableCell className="text-[#666666] font-mono text-xs">
                        {row.slug}
                      </TableCell>
                      <TableCell>
                        {row.published ? (
                          <Badge className="bg-emerald-100 text-emerald-800">공개</Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                            비공개
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-[#666666]">
                        {formatDate(row.updatedAt)}
                      </TableCell>
                      <TableCell>
                        <TemplateRowActions id={row.id} />
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
