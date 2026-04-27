import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Eye, User } from "lucide-react";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogImages, classLogs, users } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type ResourceDetailPageProps = {
  params: Promise<{ id: string }>;
};

const formatDate = (value: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);

const getClassLogDetail = async (id: string) => {
  const [log] = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      viewCount: classLogs.viewCount,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .where(eq(classLogs.id, id))
    .limit(1);

  if (!log) {
    return null;
  }

  const images = await db
    .select({
      id: classLogImages.id,
      url: classLogImages.url,
      alt: classLogImages.alt,
      order: classLogImages.order,
    })
    .from(classLogImages)
    .where(eq(classLogImages.classLogId, id))
    .orderBy(asc(classLogImages.order), asc(classLogImages.createdAt));

  return { log, images };
};

export async function generateMetadata({ params }: ResourceDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getClassLogDetail(id);

  if (!data) {
    return { title: "자료실" };
  }

  return { title: data.log.title };
}

export default async function ResourceDetailPage({ params }: ResourceDetailPageProps) {
  const { id } = await params;
  const data = await getClassLogDetail(id);

  if (!data) {
    notFound();
  }

  const { log, images } = data;

  void db
    .update(classLogs)
    .set({ viewCount: sql`${classLogs.viewCount} + 1` })
    .where(eq(classLogs.id, log.id))
    .catch((err: unknown) => {
      console.error("수업일지 조회수 업데이트 실패:", err);
    });

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link href="/resources">
          <Button variant="ghost" className="text-[#666666] hover:bg-gray-50 hover:text-[#1a1a1a]">
            <ArrowLeft className="size-4" />
            목록으로
          </Button>
        </Link>
      </div>

      <Card className="border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)] rounded-2xl py-0">
        <CardHeader className="border-b border-[#D9D9D9] py-6 sm:py-8">
          <CardTitle className="text-xl sm:text-2xl md:text-3xl font-semibold text-[#1a1a1a]">{log.title}</CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#666666] sm:gap-4 md:text-sm">
            <Badge variant="secondary" className="border border-[#D9D9D9] bg-gray-50 text-[#666666]">
              <CalendarDays className="size-3.5" />
              {formatDate(log.classDate)}
            </Badge>
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" />
              {log.authorName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Eye className="size-3.5" />
              조회수 {log.viewCount}
            </span>
          </div>
        </CardHeader>

        <CardContent className="space-y-8 py-6 sm:py-10">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[#1a1a1a]">내용</h2>
            <div className="markdown-preview break-words text-[#1a1a1a]">
              <ReactMarkdown
                remarkPlugins={[remarkBreaks]}
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
                {log.content}
              </ReactMarkdown>
            </div>
          </section>

          {images.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-[#1a1a1a]">수업 사진</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image) => (
                  <div key={image.id} className="overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)]">
                    <Image
                      src={image.url}
                      alt={image.alt?.trim() || `${log.title} 이미지`}
                      width={800}
                      height={520}
                      className="h-52 w-full object-cover"
                    />
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
