/**
 * 공개 공지 상세의 PostgreSQL 조회·조회수 갱신을 소유합니다.
 * 초안과 내부 작성자 열은 조회하지 않고, 이전·다음글의 기존 작성 시각 비교를 유지합니다.
 */
import "server-only";

import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { notices } from "@/lib/db/schema";

export type PublicNotice = {
  id: string;
  title: string;
  content: string;
  viewCount: number;
  createdAt: Date;
};

export type NoticeLink = { id: string; title: string };

/** 게시된 ID 한 건의 공개 표시 필드만 읽습니다. */
export async function findPublishedNoticeById(id: string): Promise<PublicNotice | null> {
  const row = await db.query.notices.findFirst({
    where: and(eq(notices.id, id), eq(notices.status, "PUBLISHED")),
    columns: { id: true, title: true, content: true, viewCount: true, createdAt: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    viewCount: row.viewCount,
    createdAt: row.createdAt,
  };
}

/** 동일 시각의 다른 행은 포함하지 않는 기존 엄격한 이전글 비교를 유지합니다. */
export async function findPreviousPublishedNotice(createdAt: Date): Promise<NoticeLink | null> {
  const [row] = await db
    .select({ id: notices.id, title: notices.title })
    .from(notices)
    .where(and(eq(notices.status, "PUBLISHED"), lt(notices.createdAt, createdAt)))
    .orderBy(desc(notices.createdAt))
    .limit(1);
  return row ? { id: row.id, title: row.title } : null;
}

/** 동일 시각의 다른 행은 포함하지 않는 기존 엄격한 다음글 비교를 유지합니다. */
export async function findNextPublishedNotice(createdAt: Date): Promise<NoticeLink | null> {
  const [row] = await db
    .select({ id: notices.id, title: notices.title })
    .from(notices)
    .where(and(eq(notices.status, "PUBLISHED"), gt(notices.createdAt, createdAt)))
    .orderBy(asc(notices.createdAt))
    .limit(1);
  return row ? { id: row.id, title: row.title } : null;
}

/** 응답 이후에도 DB의 현재 값에 1을 더하는 원자 UPDATE를 실행합니다. */
export async function incrementNoticeViewCount(id: string): Promise<void> {
  await db
    .update(notices)
    .set({ viewCount: sql`${notices.viewCount} + 1` })
    .where(eq(notices.id, id));
}
