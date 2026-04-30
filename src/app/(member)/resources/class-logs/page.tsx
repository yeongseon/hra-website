import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Eye, Lock } from "lucide-react";
import { asc, desc, eq } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MemberClassLogUploadForm } from "@/app/(member)/resources/class-logs/_components/member-class-log-upload-form";
import { createClassLogAsMember } from "@/features/class-logs/actions";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { classLogs, cohorts, users } from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "수업일지",
};

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const stripMarkdown = (value: string) =>
  value
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/`{1,3}([^`]+)`{1,3}/g, "$1")
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\[(.+?)\]\(.*?\)/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^---+$/gm, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ");

const getExcerpt = (value: string, length = 120) => {
  const normalized = stripMarkdown(value).replace(/\s+/g, " ").trim();
  if (normalized.length <= length) return normalized;
  return `${normalized.slice(0, length)}...`;
};

export default async function ClassLogsPage() {
  const session = await auth();
  const role = session?.user?.role;
  const canUpload = role === "ADMIN" || role === "FACULTY" || role === "MEMBER";
  const isAdminOrFaculty = role === "ADMIN" || role === "FACULTY";

  const userCohortId = session?.user?.id
    ? await db
        .select({ cohortId: users.cohortId })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1)
        .then((rows) => rows[0]?.cohortId ?? null)
    : null;

  const [logs, cohortRows] = await Promise.all([
    db
      .select({
        id: classLogs.id,
        title: classLogs.title,
        content: classLogs.content,
        classDate: classLogs.classDate,
        createdAt: classLogs.createdAt,
        viewCount: classLogs.viewCount,
        authorName: users.name,
      })
      .from(classLogs)
      .innerJoin(users, eq(classLogs.authorId, users.id))
      .where(
        !isAdminOrFaculty && userCohortId !== null
          ? eq(classLogs.cohortId, userCohortId)
          : undefined,
      )
      .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt)),
    db
      .select({ id: cohorts.id, name: cohorts.name })
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
          수업일지
        </h1>
        <p className="mx-auto max-w-2xl text-sm text-[#666666] sm:mx-0 md:text-base">
          매주 진행되는 HRA 수업의 주요 내용과 토론 결과를 확인하세요.
        </p>
      </section>

      <section className="mb-10 sm:mb-12">
        {canUpload ? (
          <MemberClassLogUploadForm
            action={createClassLogAsMember}
            cohorts={cohortRows}
            userCohortId={userCohortId}
          />
        ) : (
          <Card className="rounded-[28px] border-[#D9D9D9] bg-white py-0 shadow-[var(--shadow-soft)]">
            <CardHeader className="border-b border-[#D9D9D9] py-6">
              <CardTitle className="flex items-center gap-2 text-xl text-[#1a1a1a]">
                <Lock className="size-5 text-[#2563EB]" />
                업로드 권한 안내
              </CardTitle>
              <CardDescription className="text-sm leading-6 text-[#666666]">
                승인 대기 상태에서는 수업일지 업로드를 사용할 수 없습니다. 관리자 승인 후 다시
                이용해 주세요.
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
            {logs.length}개
          </Badge>
        </div>

        {logs.length === 0 ? (
          <Card className="rounded-2xl border-[#D9D9D9] bg-white py-10 shadow-[var(--shadow-soft)]">
            <CardContent className="text-center text-base text-[#666666]">
              등록된 수업일지가 없습니다.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {logs.map((log) => (
              <Link key={log.id} href={`/resources/${log.id}`}>
                <Card className="h-full rounded-2xl border-[#D9D9D9] bg-white text-[#1a1a1a] shadow-[var(--shadow-soft)] transition hover:border-blue-400 hover:bg-gray-50">
                  <CardHeader className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666]">
                      <Badge
                        variant="secondary"
                        className="border border-[#D9D9D9] bg-gray-50 text-[#666666]"
                      >
                        {formatDate(log.classDate)}
                      </Badge>
                      <span>{log.authorName}</span>
                      <span className="inline-flex items-center gap-1">
                        <Eye className="size-3.5" />
                        조회 {log.viewCount}
                      </span>
                    </div>
                    <CardTitle className="line-clamp-2 text-lg">{log.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription className="line-clamp-3 text-sm leading-6 text-[#666666]">
                      {getExcerpt(log.content)}
                    </CardDescription>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
