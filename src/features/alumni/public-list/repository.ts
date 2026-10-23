/**
 * 공개 수료생 이야기 목록의 건수·현재 페이지 PostgreSQL 조회를 소유합니다.
 * 전체 본문 대신 기존 SQL 평문 요약만 선택하고 고정·작성일·ID 순서를 유지합니다.
 */
import "server-only";

import { count, desc } from "drizzle-orm";
import { alumniStorySummary } from "@/features/alumni/summary";
import { db } from "@/lib/db";
import { alumniStories } from "@/lib/db/schema";

export type PublicAlumniStoryRow = {
  id: string;
  name: string;
  quote: string;
  summary: string;
  title: string | null;
  imageUrl: string | null;
};

/** 페이지 보정에 필요한 전체 수료생 이야기 건수를 읽습니다. */
export async function countAlumniStories(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(alumniStories);
  return total;
}

/** 고정·작성일·ID 역순의 한 페이지와 DB에서 만든 짧은 평문만 반환합니다. */
export async function listAlumniStoryRows(limit: number, offset: number): Promise<PublicAlumniStoryRow[]> {
  return db
    .select({
      id: alumniStories.id,
      name: alumniStories.name,
      quote: alumniStories.quote,
      summary: alumniStorySummary,
      title: alumniStories.title,
      imageUrl: alumniStories.imageUrl,
    })
    .from(alumniStories)
    .orderBy(desc(alumniStories.pinned), desc(alumniStories.createdAt), desc(alumniStories.id))
    .limit(limit)
    .offset(offset);
}
