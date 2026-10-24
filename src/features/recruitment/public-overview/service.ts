/**
 * 공개 모집안내 Page가 사용하는 Application Service입니다.
 * 저장된 상태 열이 아닌 한국 날짜 기준의 기존 모집 상태 정책을 재사용합니다.
 */
import "server-only";

import { computeRecruitmentStatus, getStoredDateKey, type RecruitmentStatus } from "@/features/recruitment/status";
import { findPublicRecruitmentCohortRow, findPublicRecruitmentSettingsRow } from "./repository";

/** DB 행 타입 대신 공개 화면에 실제로 전달하는 필드만 정의합니다. */
export type PublicRecruitmentOverview = {
  activeCohort: { name: string; description: string | null } | null;
  recruitmentStatus: RecruitmentStatus;
  recruitmentStartDate: Date | null;
  deadlineDate: Date | null;
  googleFormUrl: string | null;
  posterImageUrl: string | null;
  posterLayout: string | null;
  detailsMarkdown: string | null;
};

/** 설정이 없거나 연결된 기수가 없어도 기존 공개 빈 상태를 유지합니다. */
export async function getPublicRecruitmentOverview(now?: Date): Promise<PublicRecruitmentOverview> {
  const settings = await findPublicRecruitmentSettingsRow();
  // 기수 정보는 설정에 활성 ID가 있을 때만 읽어 불필요한 DB 조회를 피합니다.
  const cohort = settings?.activeCohortId
    ? await findPublicRecruitmentCohortRow(settings.activeCohortId)
    : null;
  const recruitmentStartDate = settings?.recruitmentStartDate ?? null;
  const deadlineDate = settings?.deadlineDate ?? null;

  // DB 조회가 한국 자정을 넘길 수 있어 기본 현재 시각은 조회를 마친 뒤 계산합니다.
  return {
    activeCohort: cohort ? { name: cohort.name, description: cohort.description } : null,
    recruitmentStatus: computeRecruitmentStatus(
      getStoredDateKey(recruitmentStartDate),
      getStoredDateKey(deadlineDate),
      now ?? new Date(),
    ),
    recruitmentStartDate,
    deadlineDate,
    googleFormUrl: settings?.googleFormUrl ?? null,
    posterImageUrl: settings?.posterImageUrl ?? null,
    posterLayout: settings?.posterLayout ?? null,
    detailsMarkdown: settings?.detailsMarkdown ?? null,
  };
}
