import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Eye, User, Printer } from "lucide-react";
import { notFound } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MarkdownViewer } from "@/components/markdown/markdown-viewer";
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
        <CardHeader className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-[#D9D9D9] py-6 sm:py-8">
          <div className="space-y-4">
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
          </div>
          <Link
            href={`/resources/${log.id}/print`}
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full border border-[#D9D9D9] px-4 py-2 text-sm font-medium text-[#1a1a1a] transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
          >
            <Printer className="size-4" />
            PDF 저장
          </Link>
        </CardHeader>

        <CardContent className="space-y-8 py-6 sm:py-10">
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[#1a1a1a]">내용</h2>
            <MarkdownViewer body={log.content} />
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
