/**
 * 홈 수료생 carousel의 표시 슬라이드와 대체 배경색을 구성합니다.
 * featured 조회·관리자 순서는 Application Service/Repository에 맡깁니다.
 */
import { listFeaturedAlumni } from "@/features/alumni/featured/service";
import { AlumniCarouselClient, type FeaturedAlumniSlide } from "./alumni-carousel-client";

const gradients = [
  "from-amber-700 via-amber-800 to-stone-900",
  "from-blue-700 via-blue-800 to-slate-900",
  "from-emerald-700 via-emerald-800 to-slate-900",
] as const;

export async function AlumniCarousel() {
  const featuredStories = await listFeaturedAlumni();

  if (featuredStories.length === 0) {
    return null;
  }

  const slides: FeaturedAlumniSlide[] = featuredStories.map((story, index) => ({
    id: story.id,
    name: story.name,
    title: story.title,
    quote: story.quote,
    imageUrl: story.imageUrl,
    gradient: gradients[index % gradients.length],
  }));

  return <AlumniCarouselClient slides={slides} />;
}
