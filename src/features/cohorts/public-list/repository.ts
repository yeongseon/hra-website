/**
 * 공개 기수 목록의 PostgreSQL 읽기를 소유합니다.
 * 시작 전 기수는 제외하고 시작일이 없는 기수와 숫자 이름 정렬을 유지합니다.
 */
import "server-only";

import { isNull, lte, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohortNumberDesc } from "@/lib/db/cohort-order";
import { cohorts } from "@/lib/db/schema";

export type PublicCohortRow = {
  name: string;
  startDate: Date | null;
  endDate: Date | null;
  description: string | null;
  isActive: boolean;
  imageUrl: string | null;
};

/** 오늘 이전에 시작했거나 시작일이 비어 있는 기수의 표시 필드만 읽습니다. */
export async function listVisibleCohortRows(asOf: Date): Promise<PublicCohortRow[]> {
  return db
    .select({
      name: cohorts.name,
      startDate: cohorts.startDate,
      endDate: cohorts.endDate,
      description: cohorts.description,
      isActive: cohorts.isActive,
      imageUrl: cohorts.imageUrl,
    })
    .from(cohorts)
    .where(or(isNull(cohorts.startDate), lte(cohorts.startDate, asOf)))
    .orderBy(cohortNumberDesc(cohorts.name));
}
