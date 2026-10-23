/**
 * 메인 carousel 수료생 이야기의 PostgreSQL 조회를 소유합니다.
 * 관리자가 featured로 지정한 다섯 표시 필드만 order 오름차순으로 읽습니다.
 */
import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";

export type FeaturedAlumniRow = {
  id: string;
  name: string;
  title: string | null;
  quote: string;
  imageUrl: string | null;
};

/** 현재 featured 표시 대상만 관리자 순서대로 조회합니다. */
export async function listFeaturedAlumniRows(): Promise<FeaturedAlumniRow[]> {
  return db
    .select({
      id: alumniStories.id,
      name: alumniStories.name,
      title: alumniStories.title,
      quote: alumniStories.quote,
      imageUrl: alumniStories.imageUrl,
    })
    .from(alumniStories)
    .where(eq(alumniStories.isFeatured, true))
    .orderBy(asc(alumniStories.order));
}
