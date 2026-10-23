/**
 * 현재 사용자 프로필을 조회하는 Application Service입니다.
 * Web 세션의 주체를 입력으로 받고, 현재 DB 행의 ID·역할이 같은 경우에만 공개 필드를 돌려줍니다.
 */
import "server-only";

import { apiV1UuidSchema } from "@hra/contracts/api-v1";
import { USER_ROLES, type UserRole } from "@hra/contracts/identity";
import { findUserProfileById, type MeProfile } from "./repository";

export type { MeProfile } from "./repository";
export type MePrincipal = { userId: string; role: UserRole };

/** 잘못된 주체는 저장소에 넘기지 않고, 삭제·역할 변경은 인증 실패로 처리할 수 있게 null을 반환합니다. */
export async function getCurrentProfile(actor: MePrincipal): Promise<MeProfile | null> {
  if (!actor || typeof actor !== "object" ||
      typeof actor.userId !== "string" || !apiV1UuidSchema.safeParse(actor.userId).success ||
      typeof actor.role !== "string" || !USER_ROLES.some((role) => role === actor.role)) {
    return null;
  }

  const profile = await findUserProfileById(actor.userId);
  if (!profile || profile.id !== actor.userId || profile.role !== actor.role) return null;
  // 저장소 교체·mock 결과에도 비공개 열이 따라 나오지 않도록 서비스 경계에서 다시 투영합니다.
  return {
    id: profile.id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    cohortId: profile.cohortId,
    image: profile.image,
  };
}
