import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, CalendarDays, User } from "lucide-react";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
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

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const toContentDoc = (content: string) => `
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root { color-scheme: light; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 20px;
        color: #1a1a1a;
        background: #ffffff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans KR", sans-serif;
        line-height: 1.8;
        white-space: pre-wrap;
        word-break: keep-all;
      }
    </style>
  </head>
  <body>${escapeHtml(content)}</body>
</html>
`;

const getClassLogDetail = async (id: string) => {
  const [log] = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
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
          </div>
        </CardHeader>

        <CardContent className="space-y-8 py-6 sm:py-10">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[#1a1a1a]">내용</h2>
            <div className="overflow-hidden rounded-xl border border-[#D9D9D9] bg-white">
              <iframe
                title="수업일지 내용"
                srcDoc={toContentDoc(log.content)}
                className="h-[420px] w-full bg-white"
              />
            </div>
          </section>

          {images.length > 0 ? (
            <section className="space-y-3">
              <h2 className="text-base font-semibold text-[#1a1a1a]">수업 사진</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {images.map((image) => (
                  <div key={image.id} className="overflow-hidden rounded-xl border border-[#D9D9D9] bg-white shadow-[var(--shadow-soft)]">
                    <img
                      src={image.url}
                      alt={image.alt?.trim() || `${log.title} 이미지`}
                      className="h-52 w-full object-cover"
                      loading="lazy"
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
