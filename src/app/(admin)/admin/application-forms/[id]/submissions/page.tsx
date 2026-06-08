/**
 * 특정 양식의 제출 내역 목록 페이지
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, count } from "drizzle-orm";
import { ChevronLeft, FileText, User, Mail, Phone, Calendar, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { 
  applicationForms, 
  applicationSubmissions, 
} from "@/lib/db/schema";
import { CsvExportButton } from "./_components/csv-export-button";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string }>;
};

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);

export default async function AdminFormSubmissionsPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  // 1. 양식 정보 조회
  const form = await db.query.applicationForms.findFirst({
    where: eq(applicationForms.id, id),
  });

  if (!form) {
    notFound();
  }

  // 2. 제출 내역 조회
  const submissions = await db.query.applicationSubmissions.findMany({
    where: eq(applicationSubmissions.formId, id),
    orderBy: [desc(applicationSubmissions.submittedAt)],
  });

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      <div>
        <Link 
          href="/admin/application-forms" 
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-2"
        >
          <ChevronLeft className="size-4" />
          양식 목록으로 돌아가기
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">제출 내역 확인</h1>
            <p className="mt-1 text-sm text-slate-500">
              [{form.title}] 양식에 제출된 모든 지원서입니다.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <CsvExportButton formId={id} />
            <Badge variant="outline" className="w-fit h-fit px-3 py-1 bg-slate-50 text-slate-700 font-bold">
              총 {submissions.length}건
            </Badge>
          </div>
        </div>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-50/50">
                <TableRow>
                  <TableHead className="w-[200px]">이름</TableHead>
                  <TableHead>이메일</TableHead>
                  <TableHead>연락처</TableHead>
                  <TableHead>제출 일시</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">상세</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {submissions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-20 text-center text-slate-500">
                      <div className="flex flex-col items-center gap-2">
                        <FileText className="size-10 text-slate-200" />
                        <p>아직 제출된 지원서가 없습니다.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  submissions.map((sub) => (
                    <TableRow key={sub.id} className="group hover:bg-slate-50/50 transition-colors">
                      <TableCell className="font-bold text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="size-8 rounded-full bg-slate-100 flex items-center justify-center">
                            <User className="size-4 text-slate-400" />
                          </div>
                          {sub.applicantName}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Mail className="size-3.5 text-slate-400" />
                          {sub.applicantEmail}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">
                        <div className="flex items-center gap-1.5">
                          <Phone className="size-3.5 text-slate-400" />
                          {sub.applicantPhone || "-"}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-500 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="size-3.5 text-slate-400" />
                          {formatDateTime(sub.submittedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-medium">
                          {sub.status === "PENDING" ? "검토중" : sub.status === "ACCEPTED" ? "합격" : "불합격"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          asChild
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Link href={`/admin/application-forms/${id}/submissions/${sub.id}`}>
                            내용 보기
                            <ChevronRight className="ml-1 size-3.5" />
                          </Link>
                        </Button>
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
