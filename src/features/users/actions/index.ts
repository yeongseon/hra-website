/**
 * 회원 역할 변경 서버 액션
 * 
 * 관리자가 회원의 역할을 변경할 때 사용합니다.
 * 
 * "use server" 표기: 이 파일의 함수는 서버에서만 실행됩니다.
 */
"use server";

import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";

const updateRoleSchema = z.object({
  userId: z.uuid("올바른 사용자 ID가 필요합니다."),
  role: z.enum(["ADMIN", "MEMBER", "PENDING"], {
    error: "올바른 역할이 아닙니다. (ADMIN, MEMBER 또는 PENDING)",
  }),
});

export type UpdateRoleState = {
  success: boolean;
  message: string;
};

/**
 * 회원 역할을 변경하는 서버 액션
 * 관리자만 실행할 수 있습니다.
 * 자기 자신의 역할은 변경할 수 없습니다. (실수 방지)
 */
export async function updateUserRole(
  userId: string,
  role: "ADMIN" | "MEMBER" | "PENDING"
): Promise<UpdateRoleState> {
  const session = await requireAdmin();

  const parsed = updateRoleSchema.safeParse({ userId, role });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  // 자기 자신의 역할 변경 방지
  if (session.user?.id === parsed.data.userId) {
    return {
      success: false,
      message: "자기 자신의 역할은 변경할 수 없습니다.",
    };
  }

  const result = await db
    .update(users)
    .set({ role: parsed.data.role })
    .where(eq(users.id, parsed.data.userId));

  if (result.rowCount === 0) {
    return {
      success: false,
      message: "해당 사용자를 찾을 수 없습니다.",
    };
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.userId}`);

  const roleLabels: Record<string, string> = {
    ADMIN: "관리자",
    MEMBER: "멤버",
    PENDING: "승인 대기",
  };

  return {
    success: true,
    message: `역할이 "${roleLabels[parsed.data.role]}"(으)로 변경되었습니다.`,
  };
}
