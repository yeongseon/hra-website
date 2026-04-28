import type { Metadata } from "next";
import { Info } from "lucide-react";
import { db } from "@/lib/db";
import { classLogs, guidebooks, users, weeklyTexts } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { ResourcesTabs, type ResourceItem } from "./_components/resources-tabs";

export const metadata: Metadata = {
  title: "자료실",
};

export const dynamic = "force-dynamic";

export default async function ResourcesPage() {
  const logs = await db
    .select({
      id: classLogs.id,
      title: classLogs.title,
      classDate: classLogs.classDate,
      createdAt: classLogs.createdAt,
      authorName: users.name,
    })
    .from(classLogs)
    .innerJoin(users, eq(classLogs.authorId, users.id))
    .orderBy(desc(classLogs.classDate), desc(classLogs.createdAt));

  const allWeeklyTexts = await db
    .select()
    .from(weeklyTexts)
    .orderBy(desc(weeklyTexts.createdAt));

  const allGuidebooks = await db
    .select()
    .from(guidebooks)
    .orderBy(desc(guidebooks.createdAt));

  const items: ResourceItem[] = [
    ...logs.map((log) => ({
      id: `log-${log.id}`,
      title: log.title,
      category: "수업일지" as const,
      date: log.classDate,
      author: log.authorName,
      href: `/resources/${log.id}`,
    })),
    ...allWeeklyTexts.map((text) => ({
      id: `text-${text.id}`,
      title: text.title,
      category: "주차별 텍스트" as const,
      date: text.createdAt,
      downloadUrl: text.fileUrl,
    })),
    ...allGuidebooks.map((book) => ({
      id: `guide-${book.id}`,
      title: book.title,
      category: "가이드북" as const,
      date: book.createdAt,
      downloadUrl: book.fileUrl,
    })),

  ];

  items.sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 sm:mb-14 space-y-4 text-center sm:text-left">
        <div className="flex items-center gap-4 mb-4 justify-center sm:justify-start">
          <div className="w-1 h-12 bg-[#2563EB] rounded-full" />
          <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-[#1a1a1a]">자료실</h1>
        </div>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base mx-auto sm:mx-0">
          수업일지, 주차별 텍스트, 가이드북 등 HRA 교육 자료를 확인하세요.
        </p>
      </section>

      <section className="mb-12">
        <div className="relative overflow-hidden rounded-2xl bg-amber-50 border border-amber-200 p-6 md:p-8 shadow-[var(--shadow-soft)]">
          <div className="absolute top-0 left-0 w-1 h-full bg-amber-400" />
          <div className="flex items-start sm:items-center gap-4">
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center border border-amber-200">
              <Info className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-amber-800 mb-1">열람 권한 안내</h3>
              <p className="text-[#666666] text-sm md:text-base leading-relaxed">
                자료실의 일부 콘텐츠는 수료생, 교수진, 운영진 등 내부 회원만 열람할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      <ResourcesTabs items={items} />
    </div>
  );
}
