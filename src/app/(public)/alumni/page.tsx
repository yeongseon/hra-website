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

const fallbackStories: AlumniStoryViewModel[] = [
  {
    id: 1,
    name: "17기 수료생",
    quote: "한계까지 도전하고, 성장으로 보답하다",
    story:
      "HRA에서의 1년은 단순한 교육이 아닌, 삶의 전환점이었습니다. 고전 읽기와 토론을 통해 깊이 사고하는 법을 배웠고, 케이스 스터디를 통해 실제 문제를 해결하는 역량을 키웠습니다.",
    gradient: "from-amber-700 via-amber-800 to-stone-900",
  },
  {
    id: 2,
    name: "18기 수료생",
    quote: "본질을 묻는 힘, 현업에서의 차이를 만들다",
    story:
      "HRA에서 배운 본질적 사고력은 직장에서도 큰 차이를 만들어 주었습니다. 문제의 표면이 아닌 근본을 파악하는 습관이 자연스럽게 업무에 녹아들었습니다.",
    gradient: "from-blue-700 via-blue-800 to-slate-900",
  },
  {
    id: 3,
    name: "19기 수료생",
    quote: "평생을 함께할 최고의 동료들을 얻었습니다",
    story:
      "HRA에서 가장 값진 것은 함께 성장한 동료들입니다. 매주 토요일 함께 고민하고 토론하며 쌓은 유대는 수료 후에도 계속되고 있습니다.",
    gradient: "from-emerald-700 via-emerald-800 to-slate-900",
  },
];

export default async function AlumniPage() {
  const dbStories = await db
    .select()
    .from(alumniStoriesTable)
    .orderBy(asc(alumniStoriesTable.order), asc(alumniStoriesTable.createdAt));

  const stories: AlumniStoryViewModel[] = dbStories.length > 0
    ? dbStories.map((story, index) => ({
        id: story.id,
        name: story.name,
        quote: story.quote,
        story: story.content,
        title: story.title,
        imageUrl: story.imageUrl,
        gradient: gradients[index % gradients.length],
      }))
    : fallbackStories;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 py-12 sm:py-20 md:py-32">
      <section className="mb-10 space-y-4 sm:mb-14">
        <Badge variant="outline" className="border-blue-300 bg-blue-50 text-blue-700">
          HRA ALUMNI
        </Badge>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1a1a1a] sm:text-3xl md:text-4xl lg:text-5xl">
          수료생 이야기
        </h1>
        <p className="max-w-2xl text-sm text-[#666666] md:text-base">
          HRA를 거쳐 간 수료생들이 각자의 자리에서 어떻게 성장했는지, 그 변화의 순간을 짧은 이야기로 전합니다.
        </p>
      </section>

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
    </div>
  );
}
