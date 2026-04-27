import type { Metadata } from "next";
import Image from "next/image";
import { asc } from "drizzle-orm";
import { Badge } from "@/components/ui/badge";
import { db } from "@/lib/db";
import { alumniStories as alumniStoriesTable } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "수료생 이야기",
  description: "HRA를 수료한 동문들의 성장 이야기와 사회 진출 이후의 발걸음을 만나보세요.",
};

type AlumniStoryViewModel = {
  id: number | string;
  name: string;
  quote: string;
  story: string;
  title?: string | null;
  imageUrl?: string | null;
  gradient: string;
};

const gradients = [
  "from-amber-700 via-amber-800 to-stone-900",
  "from-blue-700 via-blue-800 to-slate-900",
  "from-emerald-700 via-emerald-800 to-slate-900",
] as const;

export default async function AlumniPage() {
  const dbStories = await db
    .select()
    .from(alumniStoriesTable)
    .orderBy(asc(alumniStoriesTable.order), asc(alumniStoriesTable.createdAt));

  const stories: AlumniStoryViewModel[] = dbStories.map((story, index) => ({
    id: story.id,
    name: story.name,
    quote: story.quote,
    story: story.content,
    title: story.title,
    imageUrl: story.imageUrl,
    gradient: gradients[index % gradients.length],
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          수료생 이야기
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
          수료생 이야기
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          HRA를 거쳐 간 수료생들이 각자의 자리에서 어떻게 성장했는지, 그 변화의 순간을 짧은 이야기로 전합니다.
        </p>
      </section>

      {stories.length === 0 ? (
        <section className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-[#D9D9D9] bg-white p-12 text-center shadow-[var(--shadow-soft)]">
          <p className="text-lg font-semibold text-[#1a1a1a]">아직 등록된 수료생 이야기가 없습니다.</p>
          <p className="text-sm text-[#666666]">수료생 이야기가 등록되면 이곳에 표시됩니다.</p>
        </section>
      ) : (
        <section className="flex flex-col gap-16 md:gap-24">
          {stories.map((story, index) => (
            <article
              key={story.id}
              className={`flex flex-col gap-8 md:grid md:grid-cols-2 md:items-center md:gap-12`}
            >
              <div className={`w-full ${index % 2 === 1 ? "md:order-2" : "md:order-1"}`}>
                {story.imageUrl ? (
                  <Image
                    src={story.imageUrl}
                    alt={`${story.name} 수료생 사진`}
                    width={600}
                    height={600}
                    className="aspect-square w-full rounded-2xl object-cover shadow-[var(--shadow-soft)]"
                  />
                ) : (
                  <div
                    className={`flex aspect-square w-full items-center justify-center rounded-2xl bg-gradient-to-br ${story.gradient} shadow-[var(--shadow-soft)]`}
                  >
                    <span className="text-sm font-medium text-white/40">수료생 사진</span>
                  </div>
                )}
              </div>

              <div className={`flex flex-col ${index % 2 === 1 ? "md:order-1" : "md:order-2"}`}>
                <h2 className="text-2xl font-bold leading-snug text-[#1a1a1a] md:text-3xl">
                  &quot;{story.quote}&quot;
                </h2>
                <p className="mt-6 text-lg leading-relaxed text-[#666666]">
                  {story.story}
                </p>
                <div className="mt-8">
                  <p className="font-bold text-blue-600">{story.name}</p>
                  {story.title ? <p className="mt-1 text-sm text-[#666666]">{story.title}</p> : null}

                </div>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
