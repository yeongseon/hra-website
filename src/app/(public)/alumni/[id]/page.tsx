import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";
import { eq, lt, gt, asc, desc, or, and } from "drizzle-orm";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, User } from "lucide-react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수료생 이야기",
};

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function AlumniDetailPage({ params }: PageProps) {
  const { id } = await params;
  const storyId = id;

  if (!storyId) {
    notFound();
  }

  // 현재 이야기 가져오기
  const story = await db.query.alumniStories.findFirst({
    where: eq(alumniStories.id, storyId),
  });

  if (!story) {
    notFound();
  }

  const prevStory = await db
    .select({ id: alumniStories.id, name: alumniStories.name })
    .from(alumniStories)
    .where(
      or(
        lt(alumniStories.order, story.order),
        and(
          eq(alumniStories.order, story.order),
          lt(alumniStories.createdAt, story.createdAt)
        )
      )
    )
    .orderBy(desc(alumniStories.order), desc(alumniStories.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  const nextStory = await db
    .select({ id: alumniStories.id, name: alumniStories.name })
    .from(alumniStories)
    .where(
      or(
        gt(alumniStories.order, story.order),
        and(
          eq(alumniStories.order, story.order),
          gt(alumniStories.createdAt, story.createdAt)
        )
      )
    )
    .orderBy(asc(alumniStories.order), asc(alumniStories.createdAt))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  return (
    <div className="container mx-auto px-4 py-16 max-w-5xl">
      {/* 헤더 부분 */}
      <h1 className="text-3xl md:text-4xl font-bold text-center text-[#1a1a1a] mb-4">
        수료생 이야기
      </h1>
      <div className="w-16 h-1 bg-[#2563EB] mx-auto mb-2 rounded-full" />
      <p className="text-center text-[#666666] mb-12">{story.name}의 이야기</p>

      {/* 메인 레이아웃 (65% / 35%) */}
      <div className="md:grid md:grid-cols-[65fr_35fr] gap-12">
        {/* 왼쪽: 본문 콘텐츠 */}
        <div className="order-2 md:order-1">
          {story.quote && (
            <div className="mb-8 p-6 bg-gray-50 rounded-2xl border border-[#D9D9D9]">
              <p className="text-xl font-bold text-[#1a1a1a] italic leading-relaxed">
                "{story.quote}"
              </p>
            </div>
          )}
          <div className="prose prose-lg max-w-none text-[#1a1a1a] leading-loose whitespace-pre-wrap">
            {story.content}
          </div>
        </div>

        {/* 오른쪽: 프로필 사이드바 */}
        <div className="order-1 md:order-2 mb-8 md:mb-0">
          <div className="sticky top-24 bg-white rounded-2xl border border-[#D9D9D9] p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-48 h-48 relative mb-6 rounded-full overflow-hidden bg-gradient-to-br from-gray-100 to-gray-200 border border-[#D9D9D9] shadow-inner flex items-center justify-center flex-shrink-0">
              {story.imageUrl ? (
                <Image
                  src={story.imageUrl}
                  alt={story.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 192px, 192px"
                />
              ) : (
                <User className="w-16 h-16 text-gray-400" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-[#1a1a1a] mb-2">{story.name}</h2>
            {story.title && (
              <p className="text-[#666666] font-medium">{story.title}</p>
            )}
          </div>
        </div>
      </div>

      {/* 하단 네비게이션 */}
      <div className="flex items-center justify-between mt-16 pt-8 border-t border-[#D9D9D9]">
        {prevStory ? (
          <Link
            href={`/alumni/${prevStory.id}`}
            className="flex items-center gap-2 text-[#666666] hover:text-[#2563EB] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <div className="hidden sm:block">
              <div className="text-xs text-gray-500 mb-0.5">이전글</div>
              <div className="text-sm font-medium">{prevStory.name}의 이야기</div>
            </div>
          </Link>
        ) : (
          <div className="w-24" />
        )}

        <Link
          href="/alumni"
          className="px-8 py-2.5 border border-[#D9D9D9] rounded-lg text-sm font-medium text-[#1a1a1a] hover:bg-gray-50 transition-colors"
        >
          목록
        </Link>

        {nextStory ? (
          <Link
            href={`/alumni/${nextStory.id}`}
            className="flex items-center gap-2 text-[#666666] hover:text-[#2563EB] transition-colors text-right"
          >
            <div className="hidden sm:block text-right">
              <div className="text-xs text-gray-500 mb-0.5">다음글</div>
              <div className="text-sm font-medium">{nextStory.name}의 이야기</div>
            </div>
            <ChevronRight className="w-5 h-5" />
          </Link>
        ) : (
          <div className="w-24" />
        )}
      </div>
    </div>
  );
}
