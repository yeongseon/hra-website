/**
 * 회원 그룹 변경 서버 액션
 *
 * 관리자가 회원의 그룹(관리자/교수/기수 멤버/승인대기)을 변경할 때 사용합니다.
 * 드롭다운 값은 "ADMIN" | "FACULTY" | "PENDING" | "<cohort-uuid>" 형태입니다.
 * - ADMIN/FACULTY/PENDING: role만 업데이트, cohortId는 null로 초기화
 * - cohort UUID: role을 MEMBER로, cohortId를 해당 UUID로 업데이트
 */
"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { cohorts, users } from "@/lib/db/schema";

// "ADMIN" | "FACULTY" | "PENDING" | "<uuid>" 형태의 드롭다운 값
const groupValueSchema = z.union([
  z.enum(["ADMIN", "FACULTY", "PENDING"]),
  z.uuid("올바른 기수 ID가 아닙니다."),
]);

const updateGroupSchema = z.object({
  userId: z.uuid("올바른 사용자 ID가 필요합니다."),
  groupValue: groupValueSchema,
});

export type ActionResult = {
  success: boolean;
  message: string;
};

/**
 * 회원 그룹을 변경하는 서버 액션
 * groupValue에 따라 role과 cohortId를 함께 업데이트합니다.
 */
export async function updateUserGroup(
  userId: string,
  groupValue: string
): Promise<ActionResult> {
  const session = await requireAdmin();

  const parsed = updateGroupSchema.safeParse({ userId, groupValue });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  if (session.user?.id === parsed.data.userId) {
    return {
      success: false,
      message: "자기 자신의 그룹은 변경할 수 없습니다.",
    };
  }

  // groupValue가 고정 역할인지, 기수 UUID인지 분기
  const isFixedRole =
    parsed.data.groupValue === "ADMIN" ||
    parsed.data.groupValue === "FACULTY" ||
    parsed.data.groupValue === "PENDING";

  if (isFixedRole) {
    // 관리자/교수/승인대기 → role 설정, cohortId null 초기화
    const result = await db
      .update(users)
      .set({
        role: parsed.data.groupValue as "ADMIN" | "FACULTY" | "PENDING",
        cohortId: null,
      })
      .where(eq(users.id, parsed.data.userId));

    if (result.rowCount === 0) {
      return { success: false, message: "해당 사용자를 찾을 수 없습니다." };
    }
  } else {
    // 기수 UUID → 해당 기수가 실제로 존재하는지 확인 후 MEMBER로 배정
    const cohort = await db
      .select({ id: cohorts.id, name: cohorts.name })
      .from(cohorts)
      .where(eq(cohorts.id, parsed.data.groupValue))
      .limit(1);

    if (cohort.length === 0) {
      return { success: false, message: "해당 기수를 찾을 수 없습니다." };
    }

    const result = await db
      .update(users)
      .set({ role: "MEMBER", cohortId: parsed.data.groupValue })
      .where(eq(users.id, parsed.data.userId));

    if (result.rowCount === 0) {
      return { success: false, message: "해당 사용자를 찾을 수 없습니다." };
    }
  }

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.userId}`);

  return { success: true, message: "그룹이 변경되었습니다." };
}

const deleteUserSchema = z.object({
  userId: z.uuid("올바른 사용자 ID가 필요합니다."),
});

export async function deleteUser(userId: string): Promise<ActionResult> {
  const session = await requireAdmin();

  const parsed = deleteUserSchema.safeParse({ userId });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  if (session.user?.id === parsed.data.userId) {
    return { success: false, message: "자기 자신은 삭제할 수 없습니다." };
  }

  const result = await db.delete(users).where(eq(users.id, parsed.data.userId));

  if (result.rowCount === 0) {
    return { success: false, message: "해당 사용자를 찾을 수 없습니다." };
  }

  revalidatePath("/admin/users");

  return { success: true, message: "회원이 삭제되었습니다." };
}

// 기존 updateUserRole은 updateUserGroup으로 대체되었으나
// 다른 곳에서 import하는 경우를 대비해 alias로 유지합니다.
export { updateUserGroup as updateUserRole };
