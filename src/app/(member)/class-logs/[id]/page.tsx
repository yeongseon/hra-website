import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogImages, classLogs, users } from "@/lib/db/schema";
import { asc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

const getClassLog = async (id: string) => {
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

  return log;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const log = await getClassLog(id);

  if (!log) {
    return {
      title: "수업일지",
    };
  }

  return {
    title: log.title,
  };
}

export default async function ClassLogDetailPage({ params }: PageProps) {
  const { id } = await params;
  const log = await getClassLog(id);

  if (!log) {
    notFound();
  }

  const images = await db
    .select({
      id: classLogImages.id,
      url: classLogImages.url,
      alt: classLogImages.alt,
    })
    .from(classLogImages)
    .where(eq(classLogImages.classLogId, log.id))
    .orderBy(asc(classLogImages.order), asc(classLogImages.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 md:py-14">
      <div className="mb-6">
        <Link
          href="/class-logs"
          className="inline-flex items-center rounded-md border border-white/20 px-3 py-2 text-sm text-white/80 transition hover:border-white/40 hover:text-white"
        >
          목록으로
        </Link>
      </div>

      <Card className="border-white/10 bg-white/[0.03] text-white">
        <CardHeader className="space-y-4 border-b border-white/10">
          <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
            <Badge variant="secondary" className="bg-white/10 text-white">
              {formatDate(log.classDate)}
            </Badge>
            <span>{log.authorName}</span>
          </div>
          <CardTitle className="text-2xl sm:text-3xl">{log.title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <iframe
            title="수업일지 내용"
            srcDoc={`<!doctype html><html lang="ko"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><style>body{margin:0;background:#000;color:#fff;font-family:var(--font-geist-sans),sans-serif;line-height:1.75}a{color:#fff}img{max-width:100%;height:auto;border-radius:12px}h1,h2,h3,h4,h5,h6{margin:0 0 12px;color:#fff}p{margin:0 0 14px;color:rgba(255,255,255,.85)}</style></head><body>${log.content}</body></html>`}
            className="h-[520px] w-full rounded-xl border border-white/10 bg-black"
          />
        </CardContent>
      </Card>

      {images.length > 0 && (
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image) => (
            <Card key={image.id} className="border-white/10 bg-white/[0.03] p-0">
              <img
                src={image.url}
                alt={image.alt ?? log.title}
                className="h-64 w-full rounded-xl object-cover"
              />
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
