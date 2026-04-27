import type { Metadata } from "next";
import Link from "next/link";
import { and, eq, lt, gt, asc, desc, sql } from "drizzle-orm";
import { ArrowLeft, ArrowRight, CalendarDays } from "lucide-react";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { z } from "zod/v4";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

type NoticePageProps = {
  params: Promise<{ id: string }>;
};

export const dynamic = "force-dynamic";

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

async function getPublishedNoticeById(id: string) {
  const parsedId = z.uuid().safeParse(id);
  if (!parsedId.success) {
    return null;
  }

  return db.query.notices.findFirst({
    where: and(eq(notices.id, parsedId.data), eq(notices.status, "PUBLISHED")),
  });
}

// 공지 본문(Markdown) -> SNS 미리보기에 쓸 짧은 요약 텍스트.
// 마크다운 기호와 줄바꿈을 정리해 첫 160자 이내로 자릅니다.
function buildExcerpt(markdown: string, maxLength = 160): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_~\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (plain.length <= maxLength) {
    return plain;
  }

  return `${plain.slice(0, maxLength).trimEnd()}…`;
}

export async function generateMetadata({ params }: NoticePageProps): Promise<Metadata> {
  const { id } = await params;
  const notice = await getPublishedNoticeById(id);

  if (!notice) {
    return { title: "공지사항" };
  }

  const description = buildExcerpt(notice.content);

  return {
    title: notice.title,
    description,
    openGraph: {
      title: notice.title,
      description,
      type: "article",
      url: `/notices/${notice.id}`,
      publishedTime: notice.createdAt.toISOString(),
    },
    twitter: {
      title: notice.title,
      description,
    },
  };
}

export default async function NoticeDetailPage({ params }: NoticePageProps) {
  const { id } = await params;
  const notice = await getPublishedNoticeById(id);

  if (!notice) {
    notFound();
  }

  // 조회수 증가 (fire-and-forget)
  void db
    .update(notices)
    .set({ viewCount: sql`${notices.viewCount} + 1` })
    .where(eq(notices.id, notice.id))
    .catch((err: unknown) => {
      console.error("공지사항 조회수 업데이트 실패:", err);
    });

  const [prevNotice] = await db
    .select({ id: notices.id, title: notices.title })
    .from(notices)
    .where(
      and(
        eq(notices.status, "PUBLISHED"),
        lt(notices.createdAt, notice.createdAt)
      )
    )
    .orderBy(desc(notices.createdAt))
    .limit(1);

  const [nextNotice] = await db
    .select({ id: notices.id, title: notices.title })
    .from(notices)
    .where(
      and(
        eq(notices.status, "PUBLISHED"),
        gt(notices.createdAt, notice.createdAt)
      )
    )
    .orderBy(asc(notices.createdAt))
    .limit(1);

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link href="/notices">
          <Button variant="ghost" className="text-[#666666] hover:bg-gray-50 hover:text-[#1a1a1a]">
            <ArrowLeft className="size-4" />
            공지사항으로 돌아가기
          </Button>
        </Link>
      </div>

      <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0">
        <CardHeader className="border-b border-[#D9D9D9] py-6 sm:py-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-1 h-8 bg-[#2563EB] rounded-full shrink-0" />
            <CardTitle className="text-xl sm:text-2xl md:text-3xl font-semibold text-[#1a1a1a]">
              {notice.title}
            </CardTitle>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#666666] md:text-sm">
            <span>작성자 : 관리자</span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              작성일 : {formatDate(notice.createdAt)}
            </span>
            <span>조회수 : {notice.viewCount}</span>
          </div>
        </CardHeader>
        <CardContent className="py-6 sm:py-10">
          <div className="markdown-preview break-words text-[#1a1a1a]">
            <ReactMarkdown
              components={{
                h1: (props) => <h1 className="text-2xl font-bold mb-4 text-[#1a1a1a]" {...props} />,
                h2: (props) => <h2 className="text-xl font-semibold mb-3 text-[#1a1a1a]" {...props} />,
                h3: (props) => <h3 className="text-lg font-semibold mb-2 text-[#1a1a1a]" {...props} />,
                p: (props) => <p className="mb-4 leading-relaxed" {...props} />,
                ul: (props) => <ul className="list-disc ml-6 mb-4 space-y-1" {...props} />,
                ol: (props) => <ol className="list-decimal ml-6 mb-4 space-y-1" {...props} />,
                li: (props) => <li className="text-sm" {...props} />,
                code: ({ className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || "");
                  if (!match) {
                    return (
                      <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm text-blue-600" {...props}>
                        {children}
                      </code>
                    );
                  }

                  return (
                    <code className={className} {...props}>
                      {children}
                    </code>
                  );
                },
                pre: (props) => (
                  <pre className="block bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm mb-4" {...props} />
                ),
                a: (props) => <a className="text-[#2563EB] underline" {...props} />,
                blockquote: (props) => (
                  <blockquote
                    className="border-l-4 border-[#D9D9D9] pl-4 italic text-[#666666] mb-4"
                    {...props}
                  />
                ),
                hr: (props) => <hr className="border-[#D9D9D9] my-6" {...props} />,
                strong: (props) => <strong className="font-bold text-[#1a1a1a]" {...props} />,
                em: (props) => <em className="italic" {...props} />,
              }}
            >
              {notice.content}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      <div className="mt-8 flex items-center justify-between gap-4">
        {prevNotice ? (
          <Link href={`/notices/${prevNotice.id}`} className="flex items-center gap-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors">
            <ArrowLeft className="size-4" />
            <div>
              <div className="text-xs text-[#666666]">이전글</div>
              <div className="font-medium text-[#1a1a1a]">{prevNotice.title}</div>
            </div>
          </Link>
        ) : <div />}
        <Link href="/notices">
          <Button variant="outline" className="border-[#D9D9D9] text-[#666666] hover:bg-gray-50">목록</Button>
        </Link>
        {nextNotice ? (
          <Link href={`/notices/${nextNotice.id}`} className="flex items-center gap-2 text-sm text-[#666666] hover:text-[#1a1a1a] transition-colors text-right">
            <div>
              <div className="text-xs text-[#666666]">다음글</div>
              <div className="font-medium text-[#1a1a1a]">{nextNotice.title}</div>
            </div>
            <ArrowRight className="size-4" />
          </Link>
        ) : <div />}
      </div>
    </div>
  );
}
