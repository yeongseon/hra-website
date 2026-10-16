/** 브라우저 완료 표시에 앞서 실제 본인 최종 제출 ID·시각을 다시 읽는 서버 액션이다. */
"use server";
import { getMyAssignment } from "./queries";
export async function refreshMyAssignment(assignmentId: string) {
  try { return { success: true as const, assignment: await getMyAssignment(assignmentId) }; }
  catch { return { success: false as const, message: "제출 결과를 확인하지 못했습니다. 잠시 후 다시 확인해 주세요." }; }
}
