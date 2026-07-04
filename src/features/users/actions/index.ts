/**
 * 회원 그룹 변경 서버 액션
 *
 * 관리자가 회원의 그룹(관리자/교수/기수 멤버/승인대기)을 변경할 때 사용합니다.
 * 드롭다운 값은 "ADMIN" | "FACULTY" | "PENDING" | "<cohort-uuid>" 형태입니다.
 * - ADMIN/FACULTY/PENDING: role만 업데이트, cohortId는 null로 초기화
 * - cohort UUID: role을 MEMBER로, cohortId를 해당 UUID로 업데이트
 */
"use server";

import { eq, sql } from "drizzle-orm";
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

  // 대상 사용자 존재 여부만 먼저 확인 (UX: "사용자 없음" 을 마지막 ADMIN 에러와 구분)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!existing) {
    return { success: false, message: "해당 사용자를 찾을 수 없습니다." };
  }

  // groupValue가 고정 역할인지, 기수 UUID인지 분기
  const isFixedRole =
    parsed.data.groupValue === "ADMIN" ||
    parsed.data.groupValue === "FACULTY" ||
    parsed.data.groupValue === "PENDING";

  // 기수 UUID 인 경우, 실제로 존재하는 기수인지 사전 검증
  if (!isFixedRole) {
    const cohort = await db
      .select({ id: cohorts.id })
      .from(cohorts)
      .where(eq(cohorts.id, parsed.data.groupValue))
      .limit(1);

    if (cohort.length === 0) {
      return { success: false, message: "해당 기수를 찾을 수 없습니다." };
    }
  }

  const newRole = isFixedRole ? parsed.data.groupValue : "MEMBER";
  const newCohortId = isFixedRole ? null : parsed.data.groupValue;

  /*
   * 마지막 ADMIN 소실 방지 — write-skew 방지를 위해 단일 SQL 로 원자적으로 처리.
   *
   * check-then-act (app 레벨 count + 별도 update) 는 두 관리자가 동시에 서로를 강등시키면
   * 둘 다 count>=2 를 보고 통과해 결국 ADMIN 이 0명이 되는 race 가 있다.
   *
   * 아래 CTE 의 `SELECT ... FOR UPDATE` 는 statement 실행 동안 모든 ADMIN row 를 잠근다.
   * 두 concurrent request 는 같은 row 를 lock 하려 하므로 자연스럽게 직렬화된다.
   * (neon-http 는 트랜잭션 미지원이지만 단일 statement 는 원자적이므로 이 패턴이 유효)
   *
   * WHERE 절 3개 OR:
   *  - role <> 'ADMIN'                 : 원래 ADMIN 이 아니면 무조건 통과 (승격/유지)
   *  - newRole = 'ADMIN'               : 새 role 도 ADMIN 이면 no-op / 승격이므로 통과
   *  - (SELECT count FROM lock) > 1    : 잠금된 ADMIN 수가 2 이상이면 강등해도 안전
   */
  const result = await db.execute(sql`
    WITH admin_lock AS (
      SELECT id FROM ${users} WHERE ${users.role} = 'ADMIN' FOR UPDATE
    )
    UPDATE ${users}
    SET
      ${users.role} = ${newRole}::user_role,
      ${users.cohortId} = ${newCohortId}::uuid,
      ${users.updatedAt} = now()
    WHERE ${users.id} = ${parsed.data.userId}::uuid
      AND (
        ${users.role} <> 'ADMIN'
        OR ${newRole}::user_role = 'ADMIN'
        OR (SELECT count(*) FROM admin_lock) > 1
      )
    RETURNING ${users.id};
  `);

  if ((result.rowCount ?? 0) === 0) {
    return {
      success: false,
      message: "마지막 관리자입니다. 다른 관리자를 먼저 지정한 뒤 역할을 변경하세요.",
    };
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

  // 대상 사용자 존재 여부만 먼저 확인 (UX: "사용자 없음" 을 마지막 ADMIN 에러와 구분)
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);

  if (!existing) {
    return { success: false, message: "해당 사용자를 찾을 수 없습니다." };
  }

  // 마지막 ADMIN 삭제 방지 — updateUserGroup 과 동일한 write-skew 방지 패턴
  const result = await db.execute(sql`
    WITH admin_lock AS (
      SELECT id FROM ${users} WHERE ${users.role} = 'ADMIN' FOR UPDATE
    )
    DELETE FROM ${users}
    WHERE ${users.id} = ${parsed.data.userId}::uuid
      AND (
        ${users.role} <> 'ADMIN'
        OR (SELECT count(*) FROM admin_lock) > 1
      )
    RETURNING ${users.id};
  `);

  if ((result.rowCount ?? 0) === 0) {
    return {
      success: false,
      message: "마지막 관리자는 삭제할 수 없습니다. 다른 관리자를 먼저 지정하세요.",
    };
  }

  revalidatePath("/admin/users");

  return { success: true, message: "회원이 삭제되었습니다." };
}

