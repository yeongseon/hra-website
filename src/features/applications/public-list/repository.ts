/**
 * 공개 지원 양식 목록의 PostgreSQL 조회를 소유합니다.
 * 관리자 내부 열은 읽지 않고 발행된 양식의 카드 표시 필드만 전달합니다.
 */
import "server-only";

import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { applicationForms } from "@/lib/db/schema";

/** Repository 내부에서만 쓰는 세 필드 투영입니다. */
export type PublishedApplicationFormRow = {
  id: string;
  title: string;
  description: string | null;
};

/** 공개 여부만 필터하고 기존 작성일 내림차순을 그대로 유지합니다. */
export async function findPublishedApplicationFormRows(): Promise<PublishedApplicationFormRow[]> {
  return db
    .select({
      id: applicationForms.id,
      title: applicationForms.title,
      description: applicationForms.description,
    })
    .from(applicationForms)
    .where(eq(applicationForms.isPublished, true))
    .orderBy(desc(applicationForms.createdAt));
}
