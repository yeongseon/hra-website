/** 파일 교체 전에 실제 #151 취소 API의 명시적 성공만 확인한다. 객체를 삭제하거나 오류 원문을 노출하지 않는다. */
import { z } from "zod/v4";
import { readAcademicRequestReference } from "@/lib/academic-request-reference";
export async function cancelMyAssignmentUpload(assignmentId: string, uploadIntentId: string, onRequestReference?: (id:string)=>void): Promise<boolean> {
  try {
    const response = await fetch(`/api/academic/uploads/intents/${encodeURIComponent(uploadIntentId)}`, {
      method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assignmentId }),
    });
    if (!response.ok) {
      const failure=z.object({referenceId:z.unknown().optional()}).safeParse(await response.json().catch(()=>null));
      const reference=failure.success?readAcademicRequestReference(failure.data.referenceId):undefined;
      if(reference)onRequestReference?.(reference);
      return false;
    }
    return z.object({ state: z.literal("CANCELLED") }).safeParse(await response.json()).success;
  } catch { return false; }
}
