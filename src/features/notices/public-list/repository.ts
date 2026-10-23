/**
 * 공개 공지 목록의 PostgreSQL 조회를 소유합니다.
 * 초안은 조회 대상에서 제외하고 화면에 필요한 다섯 필드만 명시적으로 투영합니다.
 */
import "server-only";

import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

export type NoticeSummary = {
  id: string;
  title: string;
  pinned: boolean;
  createdAt: Date;
  viewCount: number;
};

/** API 발췌문 작성에 필요한 본문·수정 시각만 추가한 서버 내부 조회 행입니다. */
export type NoticeApiRow = NoticeSummary & {
  content: string;
  updatedAt: Date;
};

/** 개수와 목록에 같은 게시 상태·제목 검색 조건을 적용합니다. */
function publishedFilter(status: "PUBLISHED", query: string) {
  return query
    ? and(eq(notices.status, status), sql`strpos(lower(${notices.title}), lower(${query})) > 0`)
    : eq(notices.status, status);
}

/** 페이지 보정 전에 일치하는 발행 공지의 전체 개수를 읽습니다. */
export async function countNotices(status: "PUBLISHED", query: string): Promise<number> {
  const [{ total }] = await db
    .select({ total: count() })
    .from(notices)
    .where(publishedFilter(status, query));
  return total;
}

/** 검색어를 SQL 값으로 바인딩하고 고정·작성일·ID 역순을 유지합니다. */
export async function listNotices(
  status: "PUBLISHED",
  query: string,
  limit: number,
  offset: number,
): Promise<readonly NoticeSummary[]> {
  return db
    .select({
      id: notices.id,
      title: notices.title,
      pinned: notices.pinned,
      createdAt: notices.createdAt,
      viewCount: notices.viewCount,
    })
    .from(notices)
    .where(publishedFilter(status, query))
    .orderBy(desc(notices.pinned), desc(notices.createdAt), desc(notices.id))
    .limit(limit)
    .offset(offset);
}

/** API 목록은 본문과 수정 시각을 한 번에 읽고 클라이언트 반환 전에 서비스가 본문을 제거합니다. */
export async function listNoticeApiRows(
  status: "PUBLISHED",
  query: string,
  limit: number,
  offset: number,
): Promise<readonly NoticeApiRow[]> {
  return db
    .select({
      id: notices.id,
      title: notices.title,
      content: notices.content,
      pinned: notices.pinned,
      viewCount: notices.viewCount,
      createdAt: notices.createdAt,
      updatedAt: notices.updatedAt,
    })
    .from(notices)
    .where(publishedFilter(status, query))
    .orderBy(desc(notices.pinned), desc(notices.createdAt), desc(notices.id))
    .limit(limit)
    .offset(offset);
}
