import { eq, desc } from "drizzle-orm";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileText } from "lucide-react";
import { db } from "@/lib/db";
import { applicationForms } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export default async function RecruitmentApplyPage() {
  // 1. 공개된 모든 지원서 양식 조회
  const publishedForms = await db.query.applicationForms.findMany({
    where: eq(applicationForms.isPublished, true),
    orderBy: [desc(applicationForms.createdAt)],
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-20 md:py-32">
      <section className="mb-12 space-y-4 text-center sm:text-left">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700 px-3 py-1 font-bold">
          모집 지원
        </Badge>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900">
          지원서 작성
        </h1>
        <p className="max-w-2xl text-lg text-slate-500 leading-relaxed">
          현재 지원 가능한 모집 양식 목록입니다. 지원을 원하시는 항목을 선택해주세요.
        </p>
      </section>

      {publishedForms.length === 0 ? (
        <Card className="rounded-2xl border-slate-200 bg-white py-0 shadow-sm">
          <CardContent className="py-20 text-center text-slate-500">
            <p className="text-lg">현재 진행 중인 모집이 없습니다.</p>
            <p className="mt-1 text-sm">새로운 모집 소식은 홈페이지 공지사항을 확인해주세요.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6">
          {publishedForms.map((form) => (
            <Card key={form.id} className="rounded-2xl border-slate-200 bg-white shadow-sm hover:shadow-md transition-all">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="size-5 text-blue-600" />
                  {form.title}
                </CardTitle>
                <Badge variant="secondary" className="bg-blue-50 text-blue-700">진행중</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-slate-600 mb-6">{form.description}</p>
                <Button asChild className="w-full sm:w-auto bg-slate-900 hover:bg-slate-700">
                  <Link href={`/recruitment/apply/${form.id}`}>
                    지원서 작성하기
                    <ChevronRight className="ml-2 size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
