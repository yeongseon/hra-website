/**
 * 승인 회원용 가이드북 목록의 PostgreSQL 조회를 소유합니다.
 * 원본 파일 URL·파일명은 쿼리 열에서 제외하고 정렬에 필요한 작성 시각만 내부에 유지합니다.
 */
import "server-only";

import { count, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { guidebooks } from "@/lib/db/schema";

export type GuidebookListRecord = {
  id: string;
  title: string;
  createdAt: Date;
};

/** 가이드북에는 초안 상태가 없으므로 전체 메타데이터 행을 셉니다. */
export async function countGuidebooks(): Promise<number> {
  const [{ total }] = await db.select({ total: count() }).from(guidebooks);
  return total;
}

/** 작성 시각·ID 역순의 안정된 페이지를 읽되 파일 위치와 원본 이름은 조회하지 않습니다. */
export async function listGuidebooks(pageSize: number, offset: number): Promise<GuidebookListRecord[]> {
  const rows = await db
    .select({ id: guidebooks.id, title: guidebooks.title, createdAt: guidebooks.createdAt })
    .from(guidebooks)
    .orderBy(desc(guidebooks.createdAt), desc(guidebooks.id))
    .limit(pageSize)
    .offset(offset);
  return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.createdAt }));
}
