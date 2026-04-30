import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Download, Eye, ImageIcon, Lock } from "lucide-react";
import { asc, eq, sql } from "drizzle-orm";
import { weeklyTexts as weeklyTextsTable } from "@/lib/db/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberUploadForm } from "@/app/(member)/resources/weekly-texts/_components/member-upload-form";
import { createWeeklyTextAsMember } from "@/features/weekly-texts/actions";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cohorts, users } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "주차별 텍스트",
};

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

export default async function WeeklyTextsPage() {
  const session = await auth();
  const role = session?.user?.role;
  // ADMIN, FACULTY, MEMBER 업로드 가능 (PENDING 불가)
  const canUpload = role === "ADMIN" || role === "FACULTY" || role === "MEMBER";

  // 로그인 사용자의 cohortId 조회 (MEMBER일 때 기수 드롭다운 고정에 사용)
  const userCohortId = session?.user?.id
    ? await db
        .select({ cohortId: users.cohortId })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
        .then((rows) => rows[0]?.cohortId ?? null)
    : null;

  // ADMIN/FACULTY는 전체 기수 조회, MEMBER는 본인 기수 글만 조회
  // MEMBER인데 기수가 없으면 빈 목록 처리 (DB 조회 생략)
  const isAdminOrFaculty = role === "ADMIN" || role === "FACULTY";
  const isMemberWithoutCohort = role === "MEMBER" && userCohortId === null;

  const [texts, cohortRows] = await Promise.all([
    isMemberWithoutCohort
      ? Promise.resolve([])
      : db.query.weeklyTexts.findMany({
          with: {
            cohort: true,
            images: true,
          },
          where:
            !isAdminOrFaculty && userCohortId !== null
              ? eq(weeklyTextsTable.cohortId, userCohortId)
              : undefined,
          orderBy: (table) => [sql`${table.classDate} DESC NULLS LAST`, sql`${table.createdAt} DESC`],
        }),
    db
      .select({
        id: cohorts.id,
        name: cohorts.name,
      })
      .from(cohorts)
      .orderBy(asc(cohorts.order), asc(cohorts.createdAt)),
  ]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link
          href="/resources"
          className="inline-flex items-center text-sm font-medium text-[#666666] transition-colors hover:text-[#1a1a1a]"
        >
          <ArrowLeft className="mr-2 size-4" />
          자료실
        </Link>
      </div>

      <section className="mb-10 space-y-4 text-center sm:mb-14 sm:text-left">
        <h1 className="text-3xl font-semibold tracking-tight text-[#1a1a1a] sm:text-4xl md:text-5xl">
          주차별 텍스트
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-[#666666] sm:mx-0 md:text-base">
          수업에 필요한 주차별 텍스트 자료를 확인하고, 승인된 회원은 새 텍스트를 직접 업로드할
          수 있습니다.
        </p>
      </section>

      <section className="mb-10 sm:mb-12">
        {canUpload ? (
          <MemberUploadForm action={createWeeklyTextAsMember} cohorts={cohortRows} userCohortId={userCohortId} />
        ) : (
          <Card className="rounded-[28px] border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
            <CardHeader className="border-b border-[#D9D9D9] py-6">
              <CardTitle className="flex items-center gap-2 text-xl text-[#1a1a1a]">
                <Lock className="size-5 text-[#2563EB]" />
                업로드 권한 안내
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-[#666666]">
                승인 대기 상태에서는 자료 업로드를 사용할 수 없습니다. 관리자 승인 후 다시 이용해
                주세요.
              </CardDescription>
            </CardHeader>
          </Card>
        )}
      </section>

      <section>
        <div className="mb-6 flex items-center justify-between gap-4 sm:mb-8">
          <h2 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl">
            {isAdminOrFaculty
              ? "전체 목록"
              : cohortRows.find((c) => c.id === userCohortId)?.name
                ? `${cohortRows.find((c) => c.id === userCohortId)?.name} 목록`
                : "내 기수 목록"}
          </h2>
          <Badge variant="outline" className="border-[#D9D9D9] bg-white text-[#666666]">
            {texts.length}개
          </Badge>
        </div>

        {isMemberWithoutCohort ? (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
            <CardContent className="text-center text-base text-[#666666]">
              아직 기수가 배정되지 않았습니다. 관리자에게 문의해주세요.
            </CardContent>
          </Card>
        ) : texts.length === 0 ? (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
            <CardContent className="text-center text-base text-[#666666]">
              등록된 주차별 텍스트가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {texts.map((text) => (
              <div key={text.id} className="block">
                {text.body || text.images.length > 0 ? (
                  <Link href={`/resources/weekly-texts/${text.id}`} className="block">
                    <Card className="rounded-2xl border-[#D9D9D9] bg-white text-[#1a1a1a] shadow-[var(--shadow-soft)] transition hover:border-blue-400 hover:bg-gray-50">
                      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="w-fit border border-[#D9D9D9] bg-gray-50 text-[#666666]"
                            >
                              {formatDate(text.createdAt)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "w-fit border-[#D9D9D9] bg-white text-[#666666]",
                                text.cohort?.name ? "inline-flex" : "hidden",
                              )}
                            >
                              {text.cohort?.name}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "w-fit border-[#D9D9D9] bg-white text-[#666666]",
                                text.textType ? "inline-flex" : "hidden",
                              )}
                            >
                              {text.textType}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg">{text.title}</CardTitle>
                          <CardDescription className="text-sm text-[#666666]">
                            {text.body && text.images.length > 0
                              ? "본문과 첨부 사진을 함께 볼 수 있습니다."
                              : text.body
                                ? "마크다운으로 작성된 텍스트를 바로 읽을 수 있습니다."
                                : "첨부 사진과 문서를 함께 확인할 수 있습니다."}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-medium text-blue-600">
                          {text.images.length > 0 ? (
                            <span className="inline-flex items-center gap-1.5">
                              <ImageIcon className="size-4" />
                              사진 {text.images.length}장
                            </span>
                          ) : null}
                          <span className="inline-flex items-center gap-2">
                            <Eye className="size-4" />
                            보기
                          </span>
                        </div>
                      </CardHeader>
                    </Card>
                  </Link>
                ) : (
                  <a href={text.fileUrl} download={text.fileName ?? undefined} className="block">
                    <Card className="rounded-2xl border-[#D9D9D9] bg-white text-[#1a1a1a] shadow-[var(--shadow-soft)] transition hover:border-blue-400 hover:bg-gray-50">
                      <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge
                              variant="secondary"
                              className="w-fit border border-[#D9D9D9] bg-gray-50 text-[#666666]"
                            >
                              {formatDate(text.createdAt)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "w-fit border-[#D9D9D9] bg-white text-[#666666]",
                                text.cohort?.name ? "inline-flex" : "hidden",
                              )}
                            >
                              {text.cohort?.name}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={cn(
                                "w-fit border-[#D9D9D9] bg-white text-[#666666]",
                                text.textType ? "inline-flex" : "hidden",
                              )}
                            >
                              {text.textType}
                            </Badge>
                          </div>
                          <CardTitle className="text-lg">{text.title}</CardTitle>
                          <CardDescription className="text-sm text-[#666666]">
                            파일을 눌러 바로 다운로드하세요.
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 text-sm font-medium text-blue-600">
                          <Download className="size-4" />
                          다운로드
                        </div>
                      </CardHeader>
                    </Card>
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
