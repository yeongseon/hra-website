/**
 * 공개 언론보도 목록의 PostgreSQL 건수·페이지 조회를 소유합니다.
 * 관리자 순서와 게시일·ID 동점 정렬을 유지하고 게시판 표시 열만 읽습니다.
 */
import "server-only";

import { asc, count, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { pressArticles } from "@/lib/db/schema";

export type PublicPressArticleRow = {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: Date;
  viewCount: number;
};

/** 페이지 보정에 필요한 전체 기사 건수를 읽습니다. */
export async function countPressArticles(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(pressArticles);
  return total;
}

/** 관리자 순서·게시일·ID를 기준으로 한 페이지의 공개 필드만 읽습니다. */
export async function listPressArticleRows(limit: number, offset: number): Promise<PublicPressArticleRow[]> {
  return db
    .select({
      id: pressArticles.id,
      title: pressArticles.title,
      source: pressArticles.source,
      url: pressArticles.url,
      publishedAt: pressArticles.publishedAt,
      viewCount: pressArticles.viewCount,
    })
    .from(pressArticles)
    .orderBy(asc(pressArticles.order), desc(pressArticles.publishedAt), desc(pressArticles.id))
    .limit(limit)
    .offset(offset);
}
