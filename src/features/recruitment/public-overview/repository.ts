/**
 * 공개 모집안내의 PostgreSQL 조회를 소유합니다.
 * 관리자 설정 전체 행을 Page에 넘기지 않고 화면에 필요한 열과 활성 기수만 읽습니다.
 */
import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cohorts, recruitmentSettings } from "@/lib/db/schema";

/** 활성 기수 ID는 두 번째 조회에만 사용하며 공개 화면 결과에는 포함하지 않습니다. */
export type PublicRecruitmentSettingsRow = {
  activeCohortId: string | null;
  recruitmentStartDate: Date | null;
  deadlineDate: Date | null;
  googleFormUrl: string | null;
  posterImageUrl: string | null;
  posterLayout: string | null;
  detailsMarkdown: string | null;
};

export type PublicRecruitmentCohortRow = {
  id: string;
  name: string;
  description: string | null;
};

/** 단일 모집 설정에서 공개 화면과 기수 연결에 필요한 일곱 필드만 조회합니다. */
export async function findPublicRecruitmentSettingsRow(): Promise<PublicRecruitmentSettingsRow | null> {
  const [row] = await db
    .select({
      activeCohortId: recruitmentSettings.activeCohortId,
      recruitmentStartDate: recruitmentSettings.recruitmentStartDate,
      deadlineDate: recruitmentSettings.deadlineDate,
      googleFormUrl: recruitmentSettings.googleFormUrl,
      posterImageUrl: recruitmentSettings.posterImageUrl,
      posterLayout: recruitmentSettings.posterLayout,
      detailsMarkdown: recruitmentSettings.detailsMarkdown,
    })
    .from(recruitmentSettings)
    .limit(1);
  return row ?? null;
}

/** 설정에 지정된 기수가 있을 때 표시용 세 필드만 읽습니다. */
export async function findPublicRecruitmentCohortRow(id: string): Promise<PublicRecruitmentCohortRow | null> {
  const [row] = await db
    .select({ id: cohorts.id, name: cohorts.name, description: cohorts.description })
    .from(cohorts)
    .where(eq(cohorts.id, id))
    .limit(1);
  return row ?? null;
}
