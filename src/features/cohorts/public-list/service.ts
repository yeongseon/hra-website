/**
 * 공개 기수의 시작일 정책과 표시 필드 경계를 적용하는 Application Service입니다.
 * Page는 기준 시각을 전달하고 사용자 표시·장애 fallback을 담당합니다.
 */
import "server-only";

import { listVisibleCohortRows, type PublicCohortRow } from "./repository";

export type PublicCohort = PublicCohortRow;

/** 유효한 기준 시각의 기수만 읽고 저장소의 추가 열은 Page에 넘기지 않습니다. */
export async function listVisibleCohorts(asOf: Date): Promise<PublicCohort[]> {
  if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) {
    throw new TypeError("유효한 기수 조회 시각이 필요합니다.");
  }
  const rows = await listVisibleCohortRows(asOf);
  return rows.map((row) => ({
    name: row.name,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
    isActive: row.isActive,
    imageUrl: row.imageUrl,
  }));
}
