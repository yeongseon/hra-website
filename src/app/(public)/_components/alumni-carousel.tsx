import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";
import { AlumniCarouselClient, type FeaturedAlumniSlide } from "./alumni-carousel-client";

const gradients = [
  "from-amber-700 via-amber-800 to-stone-900",
  "from-blue-700 via-blue-800 to-slate-900",
  "from-emerald-700 via-emerald-800 to-slate-900",
] as const;

export async function AlumniCarousel() {
  const featuredStories = await db
    .select()
    .from(alumniStories)
    .where(eq(alumniStories.isFeatured, true))
    .orderBy(asc(alumniStories.order));

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
