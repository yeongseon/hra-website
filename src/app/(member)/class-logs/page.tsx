import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { db } from "@/lib/db";
import { classLogs, users } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수업일지",
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);

const getExcerpt = (content: string) => {
  const text = content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length > 120 ? `${text.slice(0, 120)}...` : text;
};

export default async function ClassLogsPage() {
  const logs = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      content: classLogs.content,
      classDate: classLogs.classDate,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt));

  return (
    <section className="mx-auto max-w-7xl px-6 py-10 md:py-14">
      <div className="mb-8 flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-white">수업일지</h1>
        <Badge variant="outline" className="border-white/20 text-white/80">
          {logs.length}개
        </Badge>
      </div>

      {logs.length === 0 ? (
        <Card className="border-white/10 bg-white/[0.03] text-white">
          <CardContent className="py-10 text-center text-base text-white/70">
            수업일지가 없습니다
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {logs.map((log) => (
            <Link key={log.id} href={`/class-logs/${log.id}`}>
              <Card className="h-full border-white/10 bg-white/[0.03] text-white transition hover:border-white/30 hover:bg-white/[0.06]">
                <CardHeader className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                    <Badge variant="secondary" className="bg-white/10 text-white">
                      {formatDate(log.classDate)}
                    </Badge>
                    <span>{log.authorName}</span>
                  </div>
                  <CardTitle className="line-clamp-2 text-lg">{log.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="line-clamp-3 text-sm leading-6 text-white/70">
                    {getExcerpt(log.content)}
                  </CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
