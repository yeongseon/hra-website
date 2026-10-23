/**
 * 현재 로그인 사용자의 공개 프로필 조회를 위한 PostgreSQL 저장소입니다.
 * 인증 비밀값과 OAuth 바인딩·세션 버전은 조회 열 자체에서 제외합니다.
 */
import "server-only";

import { eq } from "drizzle-orm";
import type { UserRole } from "@hra/contracts/identity";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

export type MeProfile = {
  id: string;
  name: string | null;
  email: string | null;
  role: UserRole;
  cohortId: string | null;
  image: string | null;
};

/** 세션이 가리키는 ID 한 건만 조회하고 허용된 여섯 필드로 다시 구성합니다. */
export async function findUserProfileById(id: string): Promise<MeProfile | null> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      cohortId: true,
      image: true,
    },
  });

  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    cohortId: user.cohortId,
    image: user.image,
  };
}
