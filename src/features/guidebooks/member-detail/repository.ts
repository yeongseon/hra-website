/**
 * 회원 가이드북 뷰어의 PostgreSQL 상세 조회를 소유합니다.
 * 파일 원본 URL과 내부 시각은 제외하고 화면에 필요한 세 열만 읽습니다.
 */
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { guidebooks } from "@/lib/db/schema";

/** 승인 역할과 UUID 검증을 마친 서비스에서만 호출하는 단건 조회입니다. */
export async function findGuidebookForViewer(id: string) {
  const [row] = await db
    .select({ id: guidebooks.id, title: guidebooks.title, fileName: guidebooks.fileName })
    .from(guidebooks)
    .where(eq(guidebooks.id, id))
    .limit(1);
  return row ?? null;
}
