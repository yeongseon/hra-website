/**
 * 제출된 지원서 상세 내용 확인 페이지
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { eq, asc } from "drizzle-orm";
import { ChevronLeft, User, Mail, Phone, Calendar, FileText, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { 
  applicationForms, 
  applicationSubmissions, 
  applicationAnswers,
  applicationQuestions
} from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ id: string; submissionId: string }>;
};

const formatDateTime = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);

export default async function AdminSubmissionDetailPage({ params }: Props) {
  await requireAdmin();
  const { id, submissionId } = await params;

  // 1. 제출 마스터 정보 조회
  const submission = await db.query.applicationSubmissions.findFirst({
    where: eq(applicationSubmissions.id, submissionId),
    with: {
      form: true,
    }
  });

  if (!submission || submission.formId !== id) {
    notFound();
  }

  // 2. 답변 및 관련 질문 정보 조회
  const answers = await db.query.applicationAnswers.findMany({
    where: eq(applicationAnswers.submissionId, submissionId),
    with: {
      question: true,
    }
  });

  // 질문 순서대로 답변 정렬
  const sortedAnswers = [...answers].sort((a, b) => 
    (a.question?.order ?? 0) - (b.question?.order ?? 0)
  );

  return (
    <section className="mx-auto max-w-4xl px-4 sm:px-6 py-6 sm:py-10 space-y-8">
      <div>
        <Link 
          href={`/admin/application-forms/${id}/submissions`} 
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-900 transition-colors mb-2"
        >
          <ChevronLeft className="size-4" />
          제출 목록으로 돌아가기
        </Link>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">지원서 상세 보기</h1>
            <p className="mt-1 text-sm text-slate-500">
              [{submission.form.title}] 양식에 제출된 답변 상세 내용입니다.
            </p>
          </div>
          <Badge className={
            submission.status === "PENDING" ? "bg-slate-200 text-slate-700 hover:bg-slate-300" :
            submission.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" :
            "bg-red-100 text-red-700 hover:bg-red-200"
          }>
            {submission.status === "PENDING" ? "검토 대기" : submission.status === "ACCEPTED" ? "합격" : "불합격"}
          </Badge>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-3">
        {/* 사이드바: 지원자 정보 */}
        <div className="md:col-span-1 space-y-6">
          <Card className="border-slate-200 shadow-sm sticky top-24">
            <CardHeader className="bg-slate-50/50 border-b border-slate-100">
              <CardTitle className="text-sm font-bold text-slate-600 flex items-center gap-2">
                <User className="size-4" />
                지원자 기본 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="py-6 space-y-5">
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">성함</Label>
                <p className="text-base font-bold text-slate-900">{submission.applicantName}</p>
              </div>
              <Separator className="bg-slate-100" />
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">이메일</Label>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Mail className="size-3.5" />
                  {submission.applicantEmail}
                </div>
              </div>
              <Separator className="bg-slate-100" />
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">연락처</Label>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <Phone className="size-3.5" />
                  {submission.applicantPhone || "-"}
                </div>
              </div>
              <Separator className="bg-slate-100" />
              <div className="space-y-1">
                <Label className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">제출 일시</Label>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Calendar className="size-3.5" />
                  {formatDateTime(submission.submittedAt)}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 메인: 답변 내용 */}
        <div className="md:col-span-2 space-y-6">
          <Card className="border-slate-200 shadow-sm bg-white">
            <CardHeader className="border-b border-slate-100 py-4">
              <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                <FileText className="size-4 text-blue-600" />
                지원서 답변 상세
              </CardTitle>
            </CardHeader>
            <CardContent className="py-0">
              <div className="divide-y divide-slate-100">
                {sortedAnswers.map((ans, index) => (
                  <div key={ans.id} className="py-8 space-y-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded uppercase">
                          Q{index + 1}
                        </span>
                        <h3 className="text-base font-bold text-slate-900 leading-relaxed">
                          {ans.question?.title || "삭제된 질문"}
                        </h3>
                      </div>
                      {ans.question?.description && (
                        <p className="text-sm text-slate-500">{ans.question.description}</p>
                      )}
                    </div>
                    
                    <div className="bg-slate-50/50 rounded-xl p-5 border border-slate-100">
                      <div className="text-slate-800 whitespace-pre-wrap leading-relaxed">
                        {/* 답변 값이 JSON 문자열(체크박스)인 경우 파싱해서 보여줌 */}
                        {(() => {
                          try {
                            const parsed = JSON.parse(ans.value);
                            if (Array.isArray(parsed)) {
                              return (
                                <ul className="list-disc list-inside space-y-1.5">
                                  {parsed.map((v, i) => (
                                    <li key={i} className="text-slate-700 font-medium">{v}</li>
                                  ))}
                                </ul>
                              );
                            }
                          } catch (e) {}
                          return ans.value;
                        })()}
                      </div>
                    </div>
                  </div>
                ))}

                {sortedAnswers.length === 0 && (
                  <div className="py-20 text-center text-slate-400">
                    답변 데이터가 없습니다.
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          
          <div className="flex justify-center pt-4">
            <Button variant="outline" asChild className="gap-2 text-slate-600">
              <Link href={`/admin/application-forms/${id}/submissions`}>
                목록으로 돌아가기
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
