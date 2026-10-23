/**
 * 자료실 통합 목록의 현재 계정·역할 경계를 적용하는 Application Service입니다.
 * Web 세션은 호출자가 주체로 변환하고, 서비스는 검증된 회원의 표시용 DTO만 반환합니다.
 */
import "server-only";

import { apiV1UuidSchema } from "@hra/contracts/api-v1";
import { USER_ROLES, type UserRole } from "@hra/contracts/identity";
import { canReadSharedResource } from "@/features/resources/access";
import { getCurrentProfile, type MePrincipal } from "@/features/users/me/service";
import { loadResourcesOverviewRows, type ApprovedResourceRole, type ResourcesOverviewRows } from "./repository";

export type { ApprovedResourceRole, ResourcesOverviewRows } from "./repository";

export type ResourcesOverviewResult =
  | ({ kind: "ok"; role: ApprovedResourceRole; userCohortId: string | null } & ResourcesOverviewRows)
  | { kind: "unauthenticated" }
  | { kind: "forbidden" };

/** 현재 역할이 공동 자료 열람 역할일 때만 저장소 인가 입력으로 좁힙니다. */
function isApprovedRole(role: UserRole): role is ApprovedResourceRole {
  return canReadSharedResource(role);
}

/** 삭제·역할 변경 주체를 거부하고, 승인 회원일 때만 기수와 자료 목록을 읽습니다. */
export async function getResourcesOverview(principal: MePrincipal): Promise<ResourcesOverviewResult> {
  if (!principal || typeof principal !== "object" ||
      typeof principal.userId !== "string" || !apiV1UuidSchema.safeParse(principal.userId).success ||
      typeof principal.role !== "string" || !USER_ROLES.some((role) => role === principal.role)) {
    return { kind: "unauthenticated" };
  }

  // 승인 대기 세션은 프로필 조회를 포함한 모든 DB 접근 전에 차단합니다.
  if (principal.role === "PENDING") return { kind: "forbidden" };

  const verified = await getCurrentProfile(principal);
  if (!verified) return { kind: "unauthenticated" };
  if (!isApprovedRole(verified.role)) return { kind: "forbidden" };

  const rows = await loadResourcesOverviewRows({ id: verified.id, role: verified.role });
  // 저장소 구현이나 mock에 추가 열이 생겨도 본문·파일 URL이 Web props로 넘어가지 않게 재투영합니다.
  return {
    kind: "ok",
    role: verified.role,
    userCohortId: verified.cohortId,
    cohorts: rows.cohorts.map((row) => ({ id: row.id, name: row.name })),
    logs: rows.logs.map((row) => ({
      id: row.id,
      title: row.title,
      classDate: row.classDate,
      createdAt: row.createdAt,
      authorName: row.authorName,
      cohortId: row.cohortId,
    })),
    weeklyTexts: rows.weeklyTexts.map((row) => ({
      id: row.id,
      title: row.title,
      hasBody: row.hasBody,
      hasFile: row.hasFile,
      classDate: row.classDate,
      createdAt: row.createdAt,
      cohortId: row.cohortId,
      textType: row.textType,
    })),
    classMaterials: rows.classMaterials.map((row) => ({
      id: row.id,
      title: row.title,
      classDate: row.classDate,
      createdAt: row.createdAt,
      audience: row.audience,
      weekNumber: row.weekNumber,
      lectureTitle: row.lectureTitle,
      uploaderName: row.uploaderName,
    })),
    guidebooks: rows.guidebooks.map((row) => ({ id: row.id, title: row.title, createdAt: row.createdAt })),
    templates: rows.templates.map((row) => ({
      id: row.id,
      slug: row.slug,
      title: row.title,
      category: row.category,
      createdAt: row.createdAt,
    })),
  };
}
