import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { ArrowLeft, CalendarDays } from "lucide-react";
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

export async function generateMetadata({ params }: NoticePageProps): Promise<Metadata> {
  const { id } = await params;
  const notice = await getPublishedNoticeById(id);

  if (!notice) {
    return { title: "공지사항" };
  }

  return { title: notice.title };
}

export default async function NoticeDetailPage({ params }: NoticePageProps) {
  const { id } = await params;
  const notice = await getPublishedNoticeById(id);

  if (!notice) {
    notFound();
  }

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
          <CardTitle className="text-xl sm:text-2xl md:text-3xl font-semibold text-[#1a1a1a]">
            {notice.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#666666] md:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {formatDate(notice.createdAt)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="py-6 sm:py-10">
          <div className="markdown-preview break-words text-[#1a1a1a]">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 text-[#1a1a1a]" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mb-3 text-[#1a1a1a]" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mb-2 text-[#1a1a1a]" {...props} />,
                p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc ml-6 mb-4 space-y-1" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal ml-6 mb-4 space-y-1" {...props} />,
                li: ({ node, ...props }) => <li className="text-sm" {...props} />,
                code: ({ node, className, children, ...props }) => {
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
                pre: ({ node, ...props }) => (
                  <pre className="block bg-gray-100 p-4 rounded-lg overflow-x-auto text-sm mb-4" {...props} />
                ),
                a: ({ node, ...props }) => <a className="text-[#2563EB] underline" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-4 border-[#D9D9D9] pl-4 italic text-[#666666] mb-4"
                    {...props}
                  />
                ),
                hr: ({ node, ...props }) => <hr className="border-[#D9D9D9] my-6" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-bold text-[#1a1a1a]" {...props} />,
                em: ({ node, ...props }) => <em className="italic" {...props} />,
              }}
            >
              {notice.content}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
