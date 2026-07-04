/**
 * 지원서 양식 관리 페이지 (목록)
 */

import Link from "next/link";
import { desc, eq, count } from "drizzle-orm";
import { Plus, FileText } from "lucide-react";
import { buttonVariants } from "@/components/ui/button-variants";
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
import { applicationForms, cohorts, applicationSubmissions } from "@/lib/db/schema";
import { logServerError } from "@/lib/errors";
import { FormRowActions } from "./_components/form-row-actions";

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function AdminApplicationFormsPage() {
  await requireAdmin();

  const { rows, hasError } = await (async () => {
    try {
      const rows = await db
        .select({
          id: applicationForms.id,
          title: applicationForms.title,
          isPublished: applicationForms.isPublished,
          createdAt: applicationForms.createdAt,
          cohortName: cohorts.name,
          submissionCount: count(applicationSubmissions.id),
        })
        .from(applicationForms)
        .leftJoin(cohorts, eq(applicationForms.cohortId, cohorts.id))
        .leftJoin(applicationSubmissions, eq(applicationSubmissions.formId, applicationForms.id))
        .groupBy(applicationForms.id, cohorts.name)
        .orderBy(desc(applicationForms.createdAt));

      return { rows, hasError: false };
    } catch (error) {
      logServerError("admin/application-forms", error);
      return { rows: [], hasError: true };
    }
  })();

  return (
    <section className="mx-auto max-w-7xl px-4 sm:px-6 py-6 sm:py-10">
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">지원서 관리</h1>
          <p className="mt-1 text-sm text-slate-500">지원서 양식을 생성하고 제출된 내역을 관리합니다.</p>
        </div>
        <Link
          href="/admin/application-forms/new"
          className={buttonVariants({ className: "bg-slate-900 hover:bg-slate-700 w-full sm:w-auto" })}
        >
          <Plus className="mr-1 size-4" />새 양식 추가
        </Link>
      </div>

      <Card className="border-slate-200 bg-white py-0 shadow-sm">
        <CardHeader className="border-b border-slate-200 py-4">
          <CardTitle className="text-base text-slate-900">전체 양식 {rows.length}건</CardTitle>
        </CardHeader>
        <CardContent className="py-4">
          {hasError ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              데이터를 불러오지 못했습니다.
            </div>
          ) : null}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>양식 제목</TableHead>
                  <TableHead>대상 기수</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>제출 수</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="text-right">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-slate-500">
                      등록된 지원서 양식이 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((form) => (
                    <TableRow key={form.id}>
                      <TableCell className="font-medium text-slate-900">
                        <div className="flex items-center gap-2">
                          <FileText className="size-4 text-slate-400" />
                          {form.title}
                        </div>
                      </TableCell>
                      <TableCell className="text-slate-600">{form.cohortName || "미지정"}</TableCell>
                      <TableCell>
                        {form.isPublished ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/20">
                            공개
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-500/10">
                            비공개
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-slate-600">{form.submissionCount}건</TableCell>
                      <TableCell className="text-slate-500">{formatDate(form.createdAt)}</TableCell>
                      <TableCell className="text-right">
                        <FormRowActions id={form.id} isPublished={form.isPublished} />
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
