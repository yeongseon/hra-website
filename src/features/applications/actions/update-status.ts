/**
 * 지원서 상태 변경 서버 액션
 * 
 * 관리자가 지원서의 상태를 변경할 때 사용합니다.
 * PENDING(대기) → ACCEPTED(합격) 또는 REJECTED(불합격)으로 변경 가능합니다.
 * 
 * "use server" 표기: 이 파일의 함수는 서버에서만 실행됩니다.
 */
"use server";

import { eq } from "drizzle-orm";
import { z } from "zod/v4";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { db } from "@/lib/db";
import { applications } from "@/lib/db/schema";

// 입력값 유효성 검사 스키마
const updateStatusSchema = z.object({
  id: z.uuid("올바른 지원서 ID가 필요합니다."),
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED"], {
    error: "올바른 상태값이 아닙니다. (PENDING, ACCEPTED, REJECTED 중 하나)",
  }),
});

export type UpdateStatusState = {
  success: boolean;
  message: string;
};

/**
 * 지원서 상태를 변경하는 서버 액션
 * 관리자만 실행할 수 있습니다.
 */
export async function updateApplicationStatus(
  id: string,
  status: "PENDING" | "ACCEPTED" | "REJECTED"
): Promise<UpdateStatusState> {
  // 관리자 권한 확인
  await requireAdmin();

  // 입력값 검증
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "입력값을 확인해주세요.",
    };
  }

  // DB 업데이트
  const result = await db
    .update(applications)
    .set({ status: parsed.data.status })
    .where(eq(applications.id, parsed.data.id));

  if (result.rowCount === 0) {
    return {
      success: false,
      message: "해당 지원서를 찾을 수 없습니다.",
    };
  }

  // 페이지 캐시 갱신
  revalidatePath("/admin/applications");

  const statusLabels: Record<string, string> = {
    PENDING: "대기",
    ACCEPTED: "합격",
    REJECTED: "불합격",
  };

  return {
    success: true,
    message: `상태가 "${statusLabels[parsed.data.status]}"(으)로 변경되었습니다.`,
  };
}
