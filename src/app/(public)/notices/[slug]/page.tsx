import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getAllNotices, getNoticeBySlug } from "@/lib/content/notices";

type NoticePageProps = {
  params: Promise<{ slug: string }>;
};

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));

export async function generateStaticParams() {
  const notices = await getAllNotices();
  return notices.map((notice) => ({ slug: notice.slug }));
}

export async function generateMetadata({ params }: NoticePageProps): Promise<Metadata> {
  const { slug } = await params;
  const notice = await getNoticeBySlug(slug);

  if (!notice) {
    return { title: "공지사항" };
  }

  return { title: notice.title };
}

export default async function NoticeDetailPage({ params }: NoticePageProps) {
  const { slug } = await params;
  const notice = await getNoticeBySlug(slug);

  if (!notice) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <div className="mb-8">
        <Link href="/notices">
          <Button variant="ghost" className="text-zinc-200 hover:bg-zinc-900 hover:text-white">
            <ArrowLeft className="size-4" />
            공지사항으로 돌아가기
          </Button>
        </Link>
      </div>

      <Card className="border-white/10 bg-zinc-950/80 py-0">
        <CardHeader className="border-b border-white/10 py-6 sm:py-8">
          <CardTitle className="text-xl sm:text-2xl md:text-3xl font-semibold text-white">
            {notice.title}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 md:text-sm">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" />
              {formatDate(notice.createdAt)}
            </span>
          </div>
        </CardHeader>
        <CardContent className="py-6 sm:py-10">
          <div className="markdown-preview break-words text-slate-200">
            <ReactMarkdown
              components={{
                h1: ({ node, ...props }) => <h1 className="text-2xl font-bold mb-4 text-white" {...props} />,
                h2: ({ node, ...props }) => <h2 className="text-xl font-semibold mb-3 text-white" {...props} />,
                h3: ({ node, ...props }) => <h3 className="text-lg font-semibold mb-2 text-white" {...props} />,
                p: ({ node, ...props }) => <p className="mb-4 leading-relaxed" {...props} />,
                ul: ({ node, ...props }) => <ul className="list-disc ml-6 mb-4 space-y-1" {...props} />,
                ol: ({ node, ...props }) => <ol className="list-decimal ml-6 mb-4 space-y-1" {...props} />,
                li: ({ node, ...props }) => <li className="text-sm" {...props} />,
                code: ({ node, className, children, ...props }) => {
                  const match = /language-(\w+)/.exec(className || "");
                  if (!match) {
                    return (
                      <code className="bg-slate-800 px-1.5 py-0.5 rounded text-sm text-emerald-400" {...props}>
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
                  <pre className="block bg-slate-800 p-4 rounded-lg overflow-x-auto text-sm mb-4" {...props} />
                ),
                a: ({ node, ...props }) => <a className="text-cyan-400 underline" {...props} />,
                blockquote: ({ node, ...props }) => (
                  <blockquote
                    className="border-l-4 border-slate-600 pl-4 italic text-slate-400 mb-4"
                    {...props}
                  />
                ),
                hr: ({ node, ...props }) => <hr className="border-slate-700 my-6" {...props} />,
                strong: ({ node, ...props }) => <strong className="font-bold text-white" {...props} />,
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
